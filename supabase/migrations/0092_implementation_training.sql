-- 0092: implementation training. The training needs an implementation has, what
-- was delivered, and whether customer readiness was demonstrated.
--
-- Three things are kept apart on purpose:
--   * topics covered     : a row exists for the topic (implementation_training)
--   * training delivered : delivered_at, set by a person on a date
--   * readiness shown    : demonstrated_status, which needs evidence to say "demonstrated"
--
-- RESPONSIBILITY is never assumed. It is GoCanvas, Customer or Partner, and its
-- source is either the signed SOW (verbatim quote kept) or a TIS confirmation.
-- Purchased training does not set it.
--
-- TRANSCRIPTS suggest; a person decides. Five proposal types are added to
-- evidence_proposals. Approval goes through the functions below, which make the
-- same permission and version checks as the rest of the post-sale work. Nothing
-- here changes an implementation's stage, a journey task, or a purchased solution's
-- acceptance.
--
-- HISTORY goes to portal_audit_log (the table the application's audit() writes),
-- in the same transaction as the change.
--
-- MIGRATION DEPENDENCIES. 0091 (post_sale_may_manage, solution_check_version,
-- solution_components, the evidence_proposals type check it widened), 0079
-- (evidence_proposals), 0003 (implementations, adoption_areas, evidence), 0001
-- (portal_audit_log, portal_is_internal). Application code must not deploy before
-- this is applied (docs/MIGRATIONS.md).

-- ---------------------------------------------------------------------------
-- The training table
-- ---------------------------------------------------------------------------
create table public.implementation_training (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.orgs (id),
  implementation_id uuid not null references public.implementations (id) on delete restrict,

  topic text not null check (length(btrim(topic)) between 1 and 200),
  audience text check (audience is null or length(audience) <= 500),
  outcome text check (outcome is null or length(outcome) <= 1000),
  method text check (method is null or method in ('session', 'self_paced', 'recorded', 'document', 'other')),

  responsibility text check (responsibility is null or responsibility in ('gocanvas', 'customer', 'partner')),
  responsibility_source text check (responsibility_source is null or responsibility_source in ('sow', 'tis_confirmed')),
  -- The contractual wording that gives the responsibility, kept exactly as written.
  sow_quote text check (sow_quote is null or length(sow_quote) <= 2000),

  -- Optional links. Each is checked against this implementation by the trigger below.
  purchased_service_id text check (purchased_service_id is null or length(purchased_service_id) <= 100),
  solution_component_id uuid references public.solution_components (id) on delete set null,
  adoption_area_id uuid references public.adoption_areas (id) on delete set null,

  -- Delivery: a person says training was delivered, on a date.
  delivered_at date,
  delivered_by uuid references public.portal_profiles (id) on delete set null,

  -- Readiness: a separate statement about the customer, which needs evidence to be "demonstrated".
  demonstrated_status text not null default 'not_assessed'
    check (demonstrated_status in ('not_assessed', 'not_yet', 'practice_needed', 'demonstrated')),
  demonstrated_evidence_id uuid references public.evidence (id) on delete set null,
  demonstrated_at timestamptz,
  demonstrated_by uuid references public.portal_profiles (id) on delete set null,

  next_step text check (next_step is null or length(next_step) <= 1000),

  archived_at timestamptz,
  created_by uuid references public.portal_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Responsibility is set together with its source, or not at all.
  constraint implementation_training_responsibility_pair
    check ((responsibility is null) = (responsibility_source is null)),
  -- A contractual responsibility must carry the quote it came from.
  constraint implementation_training_sow_needs_quote
    check (responsibility_source <> 'sow' or sow_quote is not null),
  -- "Demonstrated" needs evidence. Any other status has none.
  constraint implementation_training_demonstrated_needs_evidence
    check ((demonstrated_status = 'demonstrated') = (demonstrated_evidence_id is not null)),
  -- A status that has been said has a time and a person.
  constraint implementation_training_demonstrated_recorded
    check (demonstrated_status = 'not_assessed' or (demonstrated_at is not null and demonstrated_by is not null))
);

create index implementation_training_impl_idx
  on public.implementation_training (implementation_id);

create trigger implementation_training_touch before update on public.implementation_training
  for each row execute function portal_touch_updated_at();

-- Integrity that a column check cannot express. It runs on every write, including
-- a write that bypasses the functions, so the rules hold either way.
create or replace function public.implementation_training_enforce()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  -- A linked solution component belongs to the same implementation.
  if new.solution_component_id is not null
     and (tg_op = 'INSERT' or new.solution_component_id is distinct from old.solution_component_id) then
    select exists (
      select 1 from public.solution_components c
       where c.id = new.solution_component_id and c.implementation_id = new.implementation_id
    ) into v_ok;
    if not v_ok then
      raise exception 'That solution component is not on this implementation. Nothing was changed.' using errcode = '22023';
    end if;
  end if;

  -- A linked adoption area belongs to the same implementation.
  if new.adoption_area_id is not null
     and (tg_op = 'INSERT' or new.adoption_area_id is distinct from old.adoption_area_id) then
    select exists (
      select 1 from public.adoption_areas a
       where a.id = new.adoption_area_id and a.implementation_id = new.implementation_id
    ) into v_ok;
    if not v_ok then
      raise exception 'That adoption area is not on this implementation. Nothing was changed.' using errcode = '22023';
    end if;
  end if;

  -- Readiness evidence belongs to the same implementation.
  if new.demonstrated_evidence_id is not null
     and (tg_op = 'INSERT' or new.demonstrated_evidence_id is distinct from old.demonstrated_evidence_id) then
    select exists (
      select 1 from public.evidence e
       where e.id = new.demonstrated_evidence_id and e.implementation_id = new.implementation_id
    ) into v_ok;
    if not v_ok then
      raise exception 'That evidence is not on this implementation, so it cannot show readiness here. Nothing was changed.' using errcode = '22023';
    end if;
  end if;

  -- A purchased training link must name a training item in this implementation's
  -- purchase record. Only checked when the link is set or changed, so an unrelated
  -- later edit is not refused because the purchase record moved on.
  if new.purchased_service_id is not null
     and (tg_op = 'INSERT' or new.purchased_service_id is distinct from old.purchased_service_id) then
    select exists (
      select 1
        from public.implementations i
        join public.portal_accounts a on a.id = i.deal_id
       where i.id = new.implementation_id
         and exists (
           select 1
             from jsonb_array_elements(
               case when jsonb_typeof(a.intake->'timeline'->'services') = 'array'
                    then a.intake->'timeline'->'services' else '[]'::jsonb end
             ) s
            where s->>'id' = new.purchased_service_id and s->>'kind' = 'training'
         )
    ) into v_ok;
    if not v_ok then
      raise exception 'That is not a training item in this implementation''s purchase record. Nothing was changed.' using errcode = '22023';
    end if;
  end if;

  return new;
end $$;

create trigger implementation_training_enforce_trg
  before insert or update on public.implementation_training
  for each row execute function public.implementation_training_enforce();

-- ---------------------------------------------------------------------------
-- Row level security: internal users may read. Nothing is written directly.
-- Every write is one of the functions below, called by the service role.
-- ---------------------------------------------------------------------------
alter table public.implementation_training enable row level security;
create policy "implementation_training internal read" on public.implementation_training
  for select to authenticated using (portal_is_internal());
revoke insert, update, delete on public.implementation_training from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Permission and value checks shared by the functions
-- ---------------------------------------------------------------------------
create or replace function public.training_require_edit(p_profile uuid, p_implementation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.post_sale_may_manage(p_profile, p_implementation) then
    raise exception
      'You can change the training of implementations you own. A manager or admin can change any of them.'
      using errcode = '42501';
  end if;
end $$;

-- Writes by a service-role call have no person behind them. Refuse them here so a
-- training write always names who made it.
create or replace function public.training_require_person(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile is null then
    raise exception 'Training changes need the person making them.' using errcode = '42501';
  end if;
end $$;

create or replace function public.training_check_responsibility(
  p_responsibility text,
  p_source text,
  p_quote text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_responsibility is null and p_source is null then
    return;
  end if;
  if p_responsibility is null or p_source is null then
    raise exception 'A responsibility needs its source, and a source needs a responsibility.' using errcode = '22023';
  end if;
  if p_responsibility not in ('gocanvas', 'customer', 'partner') then
    raise exception 'Responsibility is GoCanvas, Customer or Partner.' using errcode = '22023';
  end if;
  if p_source not in ('sow', 'tis_confirmed') then
    raise exception 'The source of a responsibility is the SOW or a TIS confirmation.' using errcode = '22023';
  end if;
  if p_source = 'sow' and nullif(btrim(coalesce(p_quote, '')), '') is null then
    raise exception 'A responsibility taken from the SOW needs the SOW wording it comes from.' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Functions (service role only)
-- ---------------------------------------------------------------------------

-- Add a training need. p_fields may name: topic (required), audience, outcome,
-- method, responsibility, responsibility_source, sow_quote, next_step,
-- purchased_service_id, solution_component_id, adoption_area_id.
create or replace function public.training_create(
  p_profile uuid,
  p_implementation uuid,
  p_fields jsonb,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_responsibility text := nullif(p_fields->>'responsibility', '');
  v_source text := nullif(p_fields->>'responsibility_source', '');
  v_quote text := nullif(p_fields->>'sow_quote', '');
begin
  perform public.training_require_person(p_profile);
  perform public.training_require_edit(p_profile, p_implementation);
  if not exists (select 1 from public.implementations where id = p_implementation) then
    raise exception 'That implementation no longer exists.' using errcode = '22023';
  end if;
  perform public.training_check_responsibility(v_responsibility, v_source, v_quote);

  insert into public.implementation_training (
    implementation_id, topic, audience, outcome, method,
    responsibility, responsibility_source, sow_quote, next_step,
    purchased_service_id, solution_component_id, adoption_area_id, created_by
  ) values (
    p_implementation,
    btrim(p_fields->>'topic'),
    nullif(btrim(p_fields->>'audience'), ''),
    nullif(btrim(p_fields->>'outcome'), ''),
    nullif(p_fields->>'method', ''),
    v_responsibility,
    v_source,
    v_quote,
    nullif(btrim(p_fields->>'next_step'), ''),
    nullif(p_fields->>'purchased_service_id', ''),
    nullif(p_fields->>'solution_component_id', '')::uuid,
    nullif(p_fields->>'adoption_area_id', '')::uuid,
    p_profile
  ) returning id into v_id;

  insert into public.portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values ('user', p_profile, 'training.created', 'implementation_training', v_id,
          jsonb_build_object('implementation_id', p_implementation, 'topic', btrim(p_fields->>'topic'),
                             'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return v_id;
end $$;

-- Change some fields of a training need. Only the keys present in p_fields change.
create or replace function public.training_update(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_fields jsonb,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.implementation_training%rowtype;
  v_key text;
  v_allowed constant text[] := array[
    'topic', 'audience', 'outcome', 'method', 'responsibility', 'responsibility_source',
    'sow_quote', 'next_step', 'purchased_service_id', 'solution_component_id', 'adoption_area_id'
  ];
  v_responsibility text;
  v_source text;
  v_quote text;
  v_changes jsonb := '{}'::jsonb;
begin
  perform public.training_require_person(p_profile);
  select * into t from public.implementation_training where id = p_id for update;
  if not found then
    raise exception 'That training no longer exists.' using errcode = '22023';
  end if;
  perform public.training_require_edit(p_profile, t.implementation_id);
  perform public.solution_check_version(p_expected, t.updated_at);
  if t.archived_at is not null then
    raise exception 'This training is archived. Restore it to change it.' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_fields) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'Unknown training field: %', v_key using errcode = '22023';
    end if;
  end loop;
  if (p_fields ? 'responsibility') <> (p_fields ? 'responsibility_source') then
    raise exception 'Set a responsibility and its source together.' using errcode = '22023';
  end if;
  if p_fields ? 'topic' and nullif(btrim(p_fields->>'topic'), '') is null then
    raise exception 'A training needs a topic.' using errcode = '22023';
  end if;

  v_responsibility := case when p_fields ? 'responsibility' then nullif(p_fields->>'responsibility', '') else t.responsibility end;
  v_source := case when p_fields ? 'responsibility_source' then nullif(p_fields->>'responsibility_source', '') else t.responsibility_source end;
  v_quote := case when p_fields ? 'sow_quote' then nullif(p_fields->>'sow_quote', '') else t.sow_quote end;
  perform public.training_check_responsibility(v_responsibility, v_source, v_quote);

  -- Record what changed, from and to, for the history entry.
  if p_fields ? 'topic' and btrim(p_fields->>'topic') is distinct from t.topic then
    v_changes := v_changes || jsonb_build_object('topic', jsonb_build_object('from', t.topic, 'to', btrim(p_fields->>'topic')));
  end if;
  if p_fields ? 'audience' and nullif(btrim(p_fields->>'audience'), '') is distinct from t.audience then
    v_changes := v_changes || jsonb_build_object('audience', jsonb_build_object('from', t.audience, 'to', nullif(btrim(p_fields->>'audience'), '')));
  end if;
  if p_fields ? 'outcome' and nullif(btrim(p_fields->>'outcome'), '') is distinct from t.outcome then
    v_changes := v_changes || jsonb_build_object('outcome', jsonb_build_object('from', t.outcome, 'to', nullif(btrim(p_fields->>'outcome'), '')));
  end if;
  if p_fields ? 'method' and nullif(p_fields->>'method', '') is distinct from t.method then
    v_changes := v_changes || jsonb_build_object('method', jsonb_build_object('from', t.method, 'to', nullif(p_fields->>'method', '')));
  end if;
  if p_fields ? 'responsibility' and (v_responsibility is distinct from t.responsibility or v_source is distinct from t.responsibility_source) then
    v_changes := v_changes || jsonb_build_object('responsibility', jsonb_build_object(
      'from', jsonb_build_object('value', t.responsibility, 'source', t.responsibility_source),
      'to', jsonb_build_object('value', v_responsibility, 'source', v_source)));
  end if;
  if p_fields ? 'next_step' and nullif(btrim(p_fields->>'next_step'), '') is distinct from t.next_step then
    v_changes := v_changes || jsonb_build_object('next_step', jsonb_build_object('from', t.next_step, 'to', nullif(btrim(p_fields->>'next_step'), '')));
  end if;
  if v_changes = '{}'::jsonb and not (p_fields ? 'sow_quote' or p_fields ? 'purchased_service_id'
       or p_fields ? 'solution_component_id' or p_fields ? 'adoption_area_id') then
    return;
  end if;

  update public.implementation_training
     set topic = case when p_fields ? 'topic' then btrim(p_fields->>'topic') else topic end,
         audience = case when p_fields ? 'audience' then nullif(btrim(p_fields->>'audience'), '') else audience end,
         outcome = case when p_fields ? 'outcome' then nullif(btrim(p_fields->>'outcome'), '') else outcome end,
         method = case when p_fields ? 'method' then nullif(p_fields->>'method', '') else method end,
         responsibility = v_responsibility,
         responsibility_source = v_source,
         sow_quote = v_quote,
         next_step = case when p_fields ? 'next_step' then nullif(btrim(p_fields->>'next_step'), '') else next_step end,
         purchased_service_id = case when p_fields ? 'purchased_service_id' then nullif(p_fields->>'purchased_service_id', '') else purchased_service_id end,
         solution_component_id = case when p_fields ? 'solution_component_id' then nullif(p_fields->>'solution_component_id', '')::uuid else solution_component_id end,
         adoption_area_id = case when p_fields ? 'adoption_area_id' then nullif(p_fields->>'adoption_area_id', '')::uuid else adoption_area_id end
   where id = p_id;

  insert into public.portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values ('user', p_profile, 'training.updated', 'implementation_training', p_id,
          jsonb_build_object('implementation_id', t.implementation_id, 'changes', v_changes,
                             'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;

-- Record that the training was delivered, on a date. Says nothing about readiness.
create or replace function public.training_record_delivery(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_delivered_on date,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.implementation_training%rowtype;
begin
  perform public.training_require_person(p_profile);
  select * into t from public.implementation_training where id = p_id for update;
  if not found then
    raise exception 'That training no longer exists.' using errcode = '22023';
  end if;
  perform public.training_require_edit(p_profile, t.implementation_id);
  perform public.solution_check_version(p_expected, t.updated_at);
  if t.archived_at is not null then
    raise exception 'This training is archived. Restore it to change it.' using errcode = '22023';
  end if;
  if p_delivered_on is null then
    raise exception 'Give the date the training was delivered.' using errcode = '22023';
  end if;

  update public.implementation_training
     set delivered_at = p_delivered_on, delivered_by = p_profile
   where id = p_id;

  insert into public.portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values ('user', p_profile, 'training.delivery_recorded', 'implementation_training', p_id,
          jsonb_build_object('implementation_id', t.implementation_id,
                             'from', t.delivered_at, 'to', p_delivered_on,
                             'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;

-- Record readiness. "demonstrated" needs evidence on this implementation; the other
-- statuses have none. Moving away from "demonstrated" needs a reason.
create or replace function public.training_record_demonstration(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_status text,
  p_evidence uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.implementation_training%rowtype;
begin
  perform public.training_require_person(p_profile);
  select * into t from public.implementation_training where id = p_id for update;
  if not found then
    raise exception 'That training no longer exists.' using errcode = '22023';
  end if;
  perform public.training_require_edit(p_profile, t.implementation_id);
  perform public.solution_check_version(p_expected, t.updated_at);
  if t.archived_at is not null then
    raise exception 'This training is archived. Restore it to change it.' using errcode = '22023';
  end if;
  if p_status not in ('not_assessed', 'not_yet', 'practice_needed', 'demonstrated') then
    raise exception 'Readiness is not assessed, not yet, practice needed, or demonstrated.' using errcode = '22023';
  end if;
  if p_status = 'demonstrated' and p_evidence is null then
    raise exception 'Readiness is shown with evidence. Attach the evidence first.' using errcode = '22023';
  end if;
  if t.demonstrated_status = 'demonstrated' and p_status <> 'demonstrated'
     and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why readiness is no longer shown as demonstrated.' using errcode = '22023';
  end if;

  update public.implementation_training
     set demonstrated_status = p_status,
         demonstrated_evidence_id = case when p_status = 'demonstrated' then p_evidence else null end,
         demonstrated_at = case when p_status = 'not_assessed' then null else now() end,
         demonstrated_by = case when p_status = 'not_assessed' then null else p_profile end
   where id = p_id;

  insert into public.portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values ('user', p_profile, 'training.readiness_recorded', 'implementation_training', p_id,
          jsonb_build_object('implementation_id', t.implementation_id,
                             'from', t.demonstrated_status, 'to', p_status,
                             'evidence_id', case when p_status = 'demonstrated' then p_evidence else null end,
                             'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;

-- Approve a transcript suggestion that readiness was demonstrated. The evidence row
-- is created from the transcript quote and linked in the same transaction.
create or replace function public.training_demonstrate_from_transcript(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_quote text,
  p_proposal uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.implementation_training%rowtype;
  v_evidence uuid;
  v_member uuid;
begin
  perform public.training_require_person(p_profile);
  select * into t from public.implementation_training where id = p_id;
  if not found then
    raise exception 'That training no longer exists.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_quote, '')), '') is null then
    raise exception 'A suggestion that readiness was shown needs the transcript quote.' using errcode = '22023';
  end if;
  select team_member_id into v_member from public.portal_profiles where id = p_profile;

  insert into public.evidence (implementation_id, title, type, description, related_entity_type, related_entity_id, uploaded_by)
  values (t.implementation_id,
          'Readiness shown: ' || t.topic,
          'training_readiness',
          p_quote,
          'implementation_training',
          p_id,
          v_member)
  returning id into v_evidence;

  perform public.training_record_demonstration(p_profile, p_id, p_expected, 'demonstrated', v_evidence, p_reason);

  insert into public.portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values ('user', p_profile, 'training.readiness_from_transcript', 'implementation_training', p_id,
          jsonb_build_object('proposal_id', p_proposal, 'evidence_id', v_evidence));
  return v_evidence;
end $$;

-- Archive or restore a training need. Nothing is deleted.
create or replace function public.training_set_archived(
  p_profile uuid,
  p_id uuid,
  p_expected timestamptz,
  p_archived boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.implementation_training%rowtype;
begin
  perform public.training_require_person(p_profile);
  select * into t from public.implementation_training where id = p_id for update;
  if not found then
    raise exception 'That training no longer exists.' using errcode = '22023';
  end if;
  perform public.training_require_edit(p_profile, t.implementation_id);
  perform public.solution_check_version(p_expected, t.updated_at);
  if p_archived and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say why this training is archived.' using errcode = '22023';
  end if;

  update public.implementation_training
     set archived_at = case when p_archived then now() else null end
   where id = p_id;

  insert into public.portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values ('user', p_profile, case when p_archived then 'training.archived' else 'training.restored' end,
          'implementation_training', p_id,
          jsonb_build_object('implementation_id', t.implementation_id,
                             'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end $$;

-- ---------------------------------------------------------------------------
-- Transcript suggestions about training
-- ---------------------------------------------------------------------------
alter table public.evidence_proposals
  add column if not exists training_id uuid references public.implementation_training (id) on delete set null,
  add column if not exists training_field text
    check (training_field is null or training_field in (
      'topic', 'audience', 'outcome', 'responsibility', 'method', 'next_step'
    )),
  add column if not exists training_value text check (training_value is null or length(training_value) <= 2000),
  add column if not exists training_date date,
  add column if not exists training_version timestamptz;

alter table public.evidence_proposals drop constraint if exists evidence_proposals_type_check;
alter table public.evidence_proposals add constraint evidence_proposals_type_check check (
  type in (
    'risk', 'issue', 'decision', 'target_date', 'owner', 'note', 'intake_suggestion', 'component_update',
    'training_add', 'training_update', 'training_delivered', 'training_demonstrated', 'training_follow_up'
  )
);

-- ---------------------------------------------------------------------------
-- Grants: the service role only, as with the 0091 functions.
-- ---------------------------------------------------------------------------
revoke all on function public.training_require_edit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.training_require_person(uuid) from public, anon, authenticated;
revoke all on function public.training_check_responsibility(text, text, text) from public, anon, authenticated;
revoke all on function public.implementation_training_enforce() from public, anon, authenticated;
revoke all on function public.training_create(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.training_update(uuid, uuid, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.training_record_delivery(uuid, uuid, timestamptz, date, text) from public, anon, authenticated;
revoke all on function public.training_record_demonstration(uuid, uuid, timestamptz, text, uuid, text) from public, anon, authenticated;
revoke all on function public.training_demonstrate_from_transcript(uuid, uuid, timestamptz, text, uuid, text) from public, anon, authenticated;
revoke all on function public.training_set_archived(uuid, uuid, timestamptz, boolean, text) from public, anon, authenticated;

grant execute on function public.training_require_edit(uuid, uuid) to service_role;
grant execute on function public.training_require_person(uuid) to service_role;
grant execute on function public.training_check_responsibility(text, text, text) to service_role;
grant execute on function public.training_create(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.training_update(uuid, uuid, timestamptz, jsonb, text) to service_role;
grant execute on function public.training_record_delivery(uuid, uuid, timestamptz, date, text) to service_role;
grant execute on function public.training_record_demonstration(uuid, uuid, timestamptz, text, uuid, text) to service_role;
grant execute on function public.training_demonstrate_from_transcript(uuid, uuid, timestamptz, text, uuid, text) to service_role;
grant execute on function public.training_set_archived(uuid, uuid, timestamptz, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Direct writes to the 0091 solution tables
-- ---------------------------------------------------------------------------
-- 0091's policies are "for all" to internal users. A signed-in internal user could
-- therefore write those tables directly and skip the permission the functions make.
-- Every application write already goes through the service role and those functions
-- (complete-solutions.server.ts uses the admin client), so direct writes are not
-- needed. Reads are unchanged.
drop policy if exists "complete_solutions internal" on public.complete_solutions;
create policy "complete_solutions internal read" on public.complete_solutions
  for select to authenticated using (portal_is_internal());
drop policy if exists "solution_components internal" on public.solution_components;
create policy "solution_components internal read" on public.solution_components
  for select to authenticated using (portal_is_internal());
drop policy if exists "solution_component_dependencies internal" on public.solution_component_dependencies;
create policy "solution_component_dependencies internal read" on public.solution_component_dependencies
  for select to authenticated using (portal_is_internal());
revoke insert, update, delete on public.complete_solutions, public.solution_components,
  public.solution_component_dependencies, public.solution_events from authenticated, anon;
