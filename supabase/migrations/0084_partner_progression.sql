-- 0084: partner stage progression, the Implementation Ready handoff, and
-- partner graduation. Each is ONE transaction: the stage, its history, the
-- milestone, the deal transition, the assignment, the audit row and the events
-- commit together or not at all.
--
-- Standard and legacy Field Fusion implementations never reach these
-- functions: each refuses anything that does not run the partner journey.

-- 1. Durable, retryable email. The outbox row is written in the same
--    transaction as the handoff it announces. The existing integration outbox
--    fans out to webhook endpoints, and an internal email has no endpoint, so
--    it cannot live there. Drained by the dispatch cron.
create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  dedupe_key text not null unique,
  kind text not null check (kind in ('assignment')),
  recipient text not null,
  subject text not null,
  html text not null,
  implementation_id uuid references implementations (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sent', 'exhausted')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  -- Lease: a worker holds a notice from claim until it finishes or the lease
  -- lapses. claim_token is the holder's identity; only it may finish the notice.
  claimed_until timestamptz,
  claim_token uuid,
  created_at timestamptz not null default now()
);
create index notification_outbox_due_idx on notification_outbox (status, next_attempt_at);
alter table notification_outbox enable row level security;

-- 2. Helpers. Each is internal: revoked from everything but the functions below.

-- The partner journey's next stage, in the template's own order. Null at the end.
create or replace function partner_next_stage(p_implementation_id uuid, p_stage text)
returns text language sql stable security definer set search_path = public as $$
  select s.stage_key
    from journey_template_stages s
   where s.template_id = (select journey_template_id from implementations where id = p_implementation_id)
     and s.position > (
       select cur.position from journey_template_stages cur
        where cur.template_id = (select journey_template_id from implementations where id = p_implementation_id)
          and cur.stage_key = p_stage)
   order by s.position
   limit 1
$$;

-- How many gate criteria are still open on a stage. A criterion is satisfied
-- only when it is done and carries its completion stamp, the one the existing
-- status writer sets. Skipping a criterion is not completing it.
create or replace function partner_gate_outstanding(p_implementation_id uuid, p_stage text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from work_items w
    join stage_instances si on si.id = w.stage_instance_id
   where w.implementation_id = p_implementation_id
     and si.stage_key = p_stage
     and w.is_gate
     and not (w.status = 'done' and w.completed_at is not null)
$$;

-- A partner's gate criterion cannot be skipped at all. The guard lives in the
-- database, so no caller, status writer or direct update can bypass it.
create or replace function partner_gate_skip_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_partner boolean;
begin
  if new.is_gate and new.status = 'skipped' then
    select (coalesce(i.journey_type = 'partner_implementation', false) or i.partner_key is not null)
      into v_partner
      from implementations i where i.id = new.implementation_id;
    if coalesce(v_partner, false) then
      raise exception 'Partner gate criteria cannot be skipped: complete "%" instead.', new.title;
    end if;
  end if;
  return new;
end $$;

create trigger work_items_partner_gate_skip_guard
  before insert or update of status on work_items
  for each row execute function partner_gate_skip_guard();

-- Move the implementation to a stage: close the open history row, open the new
-- one, set the stage, and resync the rail's stage rows from it.
create or replace function partner_move_stage(
  p_implementation_id uuid,
  p_to text,
  p_entered_by uuid,
  p_notes text,
  p_gaps boolean,
  p_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  update implementation_stage_history set exited_at = p_at
   where implementation_id = p_implementation_id and exited_at is null;
  insert into implementation_stage_history
    (implementation_id, stage, entered_at, entered_by, notes, advanced_with_gaps, exited_at)
  values (p_implementation_id, p_to, p_at, p_entered_by, p_notes, p_gaps, null);
  update implementations
     set current_stage = p_to, stage_entered_at = p_at, updated_at = p_at
   where id = p_implementation_id;
  perform resync_stage_instances(p_implementation_id);
end $$;

-- Lock the implementation and refuse anything that is not a partner journey.
create or replace function partner_lock(p_implementation_id uuid)
returns implementations language plpgsql security definer set search_path = public as $$
declare v implementations%rowtype;
begin
  select * into v from implementations where id = p_implementation_id for update;
  if not found then
    raise exception 'Implementation % not found', p_implementation_id;
  end if;
  -- Null-safe: a standard implementation has a NULL journey_type, and a plain
  -- comparison with NULL would not refuse it.
  if not (coalesce(v.journey_type = 'partner_implementation', false) or v.partner_key is not null) then
    raise exception 'This implementation does not run the partner journey.';
  end if;
  return v;
end $$;

-- Record the change for the outbox and the audit log, in the same transaction.
-- Each event gets its own key: duplicate protection is the stage check in the
-- caller, not the event key.
create or replace function partner_record(
  p_implementation_id uuid,
  p_deal_id uuid,
  p_event text,
  p_payload jsonb,
  p_actor_profile uuid,
  p_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into integration_events (event_type, entity_type, entity_id, implementation_id, payload, dedupe_key)
  values (p_event, 'implementation', p_implementation_id, p_implementation_id, p_payload,
          p_event || ':' || p_implementation_id || ':' || gen_random_uuid());
  insert into portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values (case when p_actor_profile is null then 'system' else 'user' end, p_actor_profile,
          p_event, case when p_deal_id is null then 'implementation' else 'account' end,
          coalesce(p_deal_id, p_implementation_id), p_payload);
end $$;

-- Set the Implementation Ready / Roll Out milestone complete. The one write
-- path for a milestone's completion: the transition that finishes the stage.
create or replace function partner_complete_milestone(
  p_implementation_id uuid,
  p_name text,
  p_stage text,
  p_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from milestones where implementation_id = p_implementation_id and name = p_name) then
    update milestones set status = 'completed', completed_date = p_at::date
     where implementation_id = p_implementation_id and name = p_name;
  else
    insert into milestones (implementation_id, name, stage, status, completed_date)
    values (p_implementation_id, p_name, p_stage, 'completed', p_at::date);
  end if;
end $$;

-- 3. Advance to the next stage. Blocking gates refuse; advisory gates advance
--    and record the gap. The Implementation Ready handoff is not an advance.
create or replace function advance_partner_stage(
  p_implementation_id uuid,
  p_to_stage text,
  p_entered_by uuid,
  p_actor_profile uuid,
  p_notes text,
  p_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v implementations%rowtype;
  v_expected text;
  v_mode text;
  v_open int;
  v_gaps boolean := false;
begin
  v := partner_lock(p_implementation_id);
  if v.current_stage = 'partner_setup' then
    raise exception 'Move past Partner Setup & Connection with the handoff, not an advance.';
  end if;
  v_expected := partner_next_stage(p_implementation_id, v.current_stage);
  if v_expected is null then
    raise exception 'No next stage from %: this is the last stage.', v.current_stage;
  end if;
  if p_to_stage <> v_expected then
    raise exception 'Only the next stage is allowed. Expected %, received %.', v_expected, p_to_stage;
  end if;

  select gate_mode into v_mode from stage_instances
   where implementation_id = p_implementation_id and stage_key = v.current_stage;
  v_open := partner_gate_outstanding(p_implementation_id, v.current_stage);
  if v_open > 0 then
    if v_mode = 'blocking' then
      raise exception 'closed_gate: % gate criteria are still open on %, and this stage is blocking.',
        v_open, v.current_stage;
    end if;
    v_gaps := true;
  end if;

  perform partner_move_stage(p_implementation_id, p_to_stage, p_entered_by, p_notes, v_gaps, p_at);
  perform partner_record(p_implementation_id, v.deal_id, 'stage.changed',
    jsonb_build_object('from_stage', v.current_stage, 'to_stage', p_to_stage,
                       'advanced_with_gaps', v_gaps),
    p_actor_profile, p_at);
  return jsonb_build_object('stage', p_to_stage, 'advanced_with_gaps', v_gaps);
end $$;

-- 4. The Implementation Ready handoff: Partner Setup & Connection to Form
--    Finalisation & Data Readiness. Authoritative for the milestone: the
--    milestone is completed here and nowhere else. The deal moves to
--    onboarding_kickoff, which marks the move into GoCanvas implementation.
--    A second handoff is refused.
create or replace function partner_implementation_handoff(
  p_implementation_id uuid,
  p_team_member_id uuid,
  p_actor_team_member uuid,
  p_actor_profile uuid,
  p_assignment jsonb,
  p_outbox jsonb,
  p_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v implementations%rowtype;
  v_open int;
begin
  v := partner_lock(p_implementation_id);
  if v.current_stage <> 'partner_setup' then
    raise exception 'duplicate_handoff: this implementation is already past the handoff (at %), so nothing was handed over again.',
      v.current_stage;
  end if;
  if v.deal_id is null then
    raise exception 'This implementation has no deal, so the handoff cannot move the deal.';
  end if;

  v_open := partner_gate_outstanding(p_implementation_id, 'partner_setup');
  if v_open > 0 then
    raise exception 'closed_gate: % gate criteria are still open on Partner Setup & Connection, so the handoff was refused.',
      v_open;
  end if;

  perform partner_move_stage(p_implementation_id, 'form_finalisation', p_actor_team_member,
    'Implementation Ready: handed to GoCanvas implementation', false, p_at);
  perform partner_complete_milestone(p_implementation_id, 'Implementation Ready', 'partner_setup', p_at);

  perform portal_transition_stage(v.deal_id, 'onboarding_kickoff',
    case when p_actor_profile is null then 'system' else 'ui' end::portal_transition_source,
    p_actor_profile, null, 'Handed to GoCanvas implementation (Implementation Ready)', p_at);

  if p_team_member_id is not null then
    update implementations set owner_id = p_team_member_id, updated_at = p_at
     where id = p_implementation_id;
    insert into portal_assignments
      (deal_id, implementation_id, team_member_id, weight, breakdown, source, actor_profile_id, note)
    values (v.deal_id, p_implementation_id, p_team_member_id,
            (p_assignment ->> 'weight')::int, coalesce(p_assignment -> 'breakdown', '{}'::jsonb),
            p_assignment ->> 'source', p_actor_profile, p_assignment ->> 'note');
    perform partner_record(p_implementation_id, v.deal_id, 'implementation.assigned',
      jsonb_build_object('team_member_id', p_team_member_id, 'source', p_assignment ->> 'source'),
      p_actor_profile, p_at);
  end if;

  -- One notice per recipient: the assignee, or each pool member when the
  -- account is open to claim. Keyed, so a notice is never queued twice.
  insert into notification_outbox
    (dedupe_key, kind, recipient, subject, html, implementation_id)
  select n ->> 'dedupe_key', 'assignment', n ->> 'to', n ->> 'subject', n ->> 'html', p_implementation_id
    from jsonb_array_elements(coalesce(p_outbox, '[]'::jsonb)) n;

  perform partner_record(p_implementation_id, v.deal_id, 'implementation.handed_off',
    jsonb_build_object('to_stage', 'form_finalisation', 'assigned', p_team_member_id is not null),
    p_actor_profile, p_at);
  return jsonb_build_object('stage', 'form_finalisation', 'assigned', p_team_member_id is not null);
end $$;

-- 5. Graduation: Roll Out & Graduation's four criteria, then the deal moves to
--    onboarding_complete. The standard Graduate checklist does not apply.
create or replace function partner_implementation_graduate(
  p_implementation_id uuid,
  p_actor_team_member uuid,
  p_actor_profile uuid,
  p_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v implementations%rowtype;
  v_open int;
begin
  v := partner_lock(p_implementation_id);
  if v.current_stage <> 'roll_out' then
    raise exception 'Only Roll Out & Graduation completes a partner implementation; this one is at %.', v.current_stage;
  end if;
  if exists (select 1 from stage_instances
              where implementation_id = p_implementation_id and stage_key = 'roll_out' and status = 'done') then
    raise exception 'duplicate_graduation: this implementation has already graduated.';
  end if;
  if v.deal_id is null then
    raise exception 'This implementation has no deal, so graduation cannot move the deal.';
  end if;

  v_open := partner_gate_outstanding(p_implementation_id, 'roll_out');
  if v_open > 0 then
    raise exception 'closed_gate: % Roll Out & Graduation criteria are still open, so graduation was refused.', v_open;
  end if;

  update implementation_stage_history set exited_at = p_at
   where implementation_id = p_implementation_id and exited_at is null;
  update stage_instances set status = 'done', exited_at = p_at
   where implementation_id = p_implementation_id and stage_key = 'roll_out';
  perform partner_complete_milestone(p_implementation_id, 'Roll Out & Graduation', 'roll_out', p_at);

  perform portal_transition_stage(v.deal_id, 'onboarding_complete',
    case when p_actor_profile is null then 'system' else 'ui' end::portal_transition_source,
    p_actor_profile, null, 'Partner implementation graduated: Roll Out & Graduation complete', p_at);

  perform partner_record(p_implementation_id, v.deal_id, 'implementation.graduated',
    jsonb_build_object('to_stage', 'onboarding_complete'), p_actor_profile, p_at);
  return jsonb_build_object('graduated', true);
end $$;

-- 6. Resync, partner-aware. The standard rule is unchanged. For a partner, the
--    current stage is 'done' when it was completed and closed (graduation stamps
--    both), so a resync after graduation does not reopen Roll Out.
create or replace function resync_stage_instances(p_implementation_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  cur_key text;
  cur_pos int;
  v_partner boolean;
  changed int := 0;
begin
  if not (auth.role() = 'service_role' or portal_is_internal()) then
    raise exception 'forbidden';
  end if;

  select current_stage into cur_key from implementations where id = p_implementation_id;
  select position into cur_pos from stage_instances
   where implementation_id = p_implementation_id and stage_key = cur_key;
  if cur_pos is null then
    return jsonb_build_object('ok', false, 'reason', 'current_stage has no stage_instance');
  end if;

  select (coalesce(i.journey_type = 'partner_implementation', false) or i.partner_key is not null)
    into v_partner from implementations i where i.id = p_implementation_id;

  with target as (
    select s.id,
      case
        when s.position < cur_pos then 'done'
        when s.position = cur_pos and coalesce(v_partner, false)
             and s.status = 'done' and s.exited_at is not null then 'done'
        when s.position = cur_pos then 'active'
        else 'pending'
      end as want
      from stage_instances s
     where s.implementation_id = p_implementation_id
  )
  update stage_instances s set status = t.want
    from target t
   where s.id = t.id and s.status <> t.want;
  get diagnostics changed = row_count;

  if changed > 0 then
    insert into journey_events (implementation_id, kind, detail)
    values (p_implementation_id, 'stage_resynced',
            jsonb_build_object('current_stage', cur_key, 'rows_changed', changed));
  end if;

  return jsonb_build_object('ok', true, 'rows_changed', changed);
end;
$$;

-- 7. Notification claims. A worker claims due notices atomically: the rows are
--    locked with SKIP LOCKED and marked with a lease in the same statement, so
--    two overlapping workers can never claim the same notice. Each claim counts
--    as an attempt, so a worker that dies mid-send still uses one up.
create or replace function claim_notices(p_limit int, p_lease_seconds int)
returns table (id uuid, recipient text, subject text, html text, attempts int, claim_token uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select n.id
      from notification_outbox n
     where n.status = 'queued'
       and n.next_attempt_at <= now()
       and (n.claimed_until is null or n.claimed_until < now())
     order by n.created_at
     limit p_limit
     for update skip locked
  ),
  claimed as (
    update notification_outbox n
       set claimed_until = now() + make_interval(secs => p_lease_seconds),
           claim_token = gen_random_uuid(),
           attempts = n.attempts + 1
      from due
     where n.id = due.id
    returning n.id, n.recipient, n.subject, n.html, n.attempts, n.claim_token
  )
  select c.id, c.recipient, c.subject, c.html, c.attempts, c.claim_token from claimed c;
end $$;

-- Finish a claimed notice. Only the holder of the claim can: if the lease
-- lapsed and another worker took the notice, this returns false and changes
-- nothing. Returns whether the outcome was recorded.
create or replace function finish_notice(
  p_id uuid,
  p_token uuid,
  p_status text,
  p_error text,
  p_next timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  update notification_outbox
     set status = case when p_status = 'sent' then 'sent'
                       when p_status = 'exhausted' then 'exhausted'
                       else 'queued' end,
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         next_attempt_at = coalesce(p_next, next_attempt_at),
         last_error = p_error,
         claimed_until = null,
         claim_token = null
   where id = p_id and claim_token = p_token;
  return found;
end $$;

-- 8. Only the server (service role) runs these. Nothing else may call them.
revoke execute on function partner_next_stage(uuid, text) from public, anon, authenticated;
revoke execute on function partner_gate_outstanding(uuid, text) from public, anon, authenticated;
revoke execute on function partner_move_stage(uuid, text, uuid, text, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function partner_lock(uuid) from public, anon, authenticated;
revoke execute on function partner_record(uuid, uuid, text, jsonb, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function partner_complete_milestone(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function claim_notices(int, int) from public, anon, authenticated;
revoke execute on function finish_notice(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function claim_notices(int, int) to service_role;
grant execute on function finish_notice(uuid, uuid, text, text, timestamptz) to service_role;
revoke execute on function advance_partner_stage(uuid, text, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function partner_implementation_handoff(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function partner_implementation_graduate(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function advance_partner_stage(uuid, text, uuid, uuid, text, timestamptz) to service_role;
grant execute on function partner_implementation_handoff(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz) to service_role;
grant execute on function partner_implementation_graduate(uuid, uuid, uuid, timestamptz) to service_role;
