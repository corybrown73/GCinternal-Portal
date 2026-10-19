-- Correcting a mistaken "Kickoff held" as one transaction.
--
-- Unticking Kickoff removes the Kickoff completion and, when the deal has moved
-- on, returns it to Kickoff. Those two changes must happen together or not at
-- all: a separate save and a separate stage move can each fail alone, leaving a
-- deal that is in Kickoff with the call recorded as held, or in Get it working
-- with no record of the call. A single function gives one transaction.
--
-- The function is the only write. The server decides the policy (what counts as
-- later progress, who may correct, whether confirmation was given) from the
-- deal as it reads it, and passes the stage and the whole intake it decided on.
-- This function re-checks both under a row lock and refuses if either has
-- changed. The whole intake, not just the completion record, because later
-- progress is read from more than the record: the Complete stage's outcome is
-- in the intake too. Every intake write locks the same row, so a write that
-- lands after the server read is seen here and refused. It writes nothing else:
-- notes, transcripts, tasks, deadlines, overrides and later completions are
-- untouched, and the stage move is recorded in the stage history and the audit
-- log.
--
-- Callable by the service role only; the app reaches it through the one server
-- function that checks the signed-in person's deal-editor permission first.

create or replace function public.portal_correct_kickoff_held(
  p_deal_id uuid,
  p_expected_stage portal_account_stage,
  p_expected_intake jsonb,
  p_actor_profile uuid,
  p_note text default null,
  p_later_tasks_done integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal portal_accounts%rowtype;
  v_completed jsonb;
  v_actor_org uuid;
  v_actor_role text;
  v_row portal_stage_transitions;
  v_partner boolean;
  v_removed text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'kickoff_correction_forbidden: only the server may correct Kickoff'
      using errcode = '42501';
  end if;

  -- The signed-in person, read here as well as in the server: a customer login
  -- and a person from another organisation are both refused.
  select org_id, role::text into v_actor_org, v_actor_role
    from portal_profiles where id = p_actor_profile;
  if v_actor_role is null or v_actor_role = 'customer' then
    raise exception 'kickoff_correction_forbidden: the signed-in person may not change deal stages'
      using errcode = '42501';
  end if;

  -- Lock the deal for the rest of the transaction.
  select * into v_deal from portal_accounts where id = p_deal_id for update;
  if not found then
    raise exception 'kickoff_correction_not_found: the deal does not exist'
      using errcode = 'P0002';
  end if;
  if v_actor_org is distinct from v_deal.org_id then
    raise exception 'kickoff_correction_forbidden: the person is not in this deal''s organisation'
      using errcode = '42501';
  end if;

  -- Stale request: the stage or the intake has changed since the server
  -- decided. Nothing has been written.
  if v_deal.stage <> p_expected_stage then
    raise exception 'kickoff_correction_stale: the deal has moved since it was opened'
      using errcode = '40001';
  end if;
  if v_deal.intake is distinct from p_expected_intake then
    raise exception 'kickoff_correction_stale: the plan changed since it was opened'
      using errcode = '40001';
  end if;
  v_completed := coalesce(v_deal.intake #> '{timeline,completed}', '{}'::jsonb);

  if not (v_completed ? 'kickoff') then
    raise exception 'kickoff_correction_not_held: Kickoff is not recorded as held'
      using errcode = 'P0001';
  end if;

  -- Partner implementations keep their own journey and are never corrected here.
  select exists (
    select 1 from implementations i
     where i.deal_id = p_deal_id
       and i.superseded_by_implementation_id is null
       and (i.journey_type = 'partner_implementation' or i.partner_key is not null)
  ) or coalesce(v_deal.intake ->> 'path', '') = 'partner_implementation'
    into v_partner;
  if v_partner then
    raise exception 'kickoff_correction_not_applicable: partner implementations are not corrected here'
      using errcode = 'P0001';
  end if;

  -- One transaction: the record, the stage, the stage history and the audit log.
  v_removed := v_completed ->> 'kickoff';
  v_completed := v_completed - 'kickoff';
  perform set_config('app.allow_stage_change', 'on', true);
  update portal_accounts
     set stage = case when v_deal.stage = 'kickoff' then v_deal.stage else 'kickoff' end,
         stage_entered_at = case when v_deal.stage = 'kickoff' then v_deal.stage_entered_at else now() end,
         intake = jsonb_set(intake, '{timeline,completed}', v_completed),
         updated_at = now()
   where id = p_deal_id;
  perform set_config('app.allow_stage_change', '', true);

  if v_deal.stage <> 'kickoff' then
    insert into portal_stage_transitions
      (account_id, from_stage, to_stage, source, actor_profile_id, actor_api_key_id, note,
       occurred_at, org_id)
    values
      (p_deal_id, v_deal.stage, 'kickoff', 'ui', p_actor_profile, null,
       'Kickoff held unticked: ' || coalesce(nullif(trim(p_note), ''), 'corrected by the team'),
       now(), v_deal.org_id)
    returning * into v_row;
  end if;

  insert into portal_audit_log
    (actor_type, actor_id, action, entity_type, entity_id, payload, org_id)
  values
    ('user', p_actor_profile, 'kickoff.held_unticked', 'account', p_deal_id,
     jsonb_build_object(
       'from_stage', v_deal.stage,
       'removed_kickoff', v_removed,
       'later_tasks_done', p_later_tasks_done,
       'note', p_note),
     v_deal.org_id);

  return jsonb_build_object(
    'stage', 'kickoff',
    'from_stage', v_deal.stage,
    'transition_id', v_row.id);
end;
$$;

revoke all on function public.portal_correct_kickoff_held(
  uuid, portal_account_stage, jsonb, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.portal_correct_kickoff_held(
  uuid, portal_account_stage, jsonb, uuid, text, integer) to service_role;
