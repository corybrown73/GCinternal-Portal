-- 0088: closing an implementation without graduating the customer.
--
-- Closing an implementation says the customer does not need one. It ends the
-- implementation, and it is NOT a graduation: nothing here writes a stage, a
-- graduation, a deal stage, a launch date, a "proven" outcome or a handoff.
-- The Salesforce deal stage is left alone, as the sales outcome is.
--
-- Numbered 0088: 0087 is reserved by PR #95, which is not yet on main.
--
-- Four nullable columns hold the closure. A closed row can never be reopened
-- here: there is no reopen function, and the guard below refuses lifecycle
-- changes while the row is closed. Notes, files, journal entries and history
-- stay writable, because they are records, not progression.

alter table implementations
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references portal_profiles (id) on delete set null,
  add column if not exists closure_reason text,
  add column if not exists closure_note text;

alter table implementations
  drop constraint if exists implementations_closure_reason_check,
  add constraint implementations_closure_reason_check check (
    closure_reason is null or closure_reason in ('implementation_not_required')
  );

-- Open means every closure column is empty. Closed means the reason, the time
-- and a real explanation are all recorded. closed_by may later go null, if the
-- profile is deleted; the time, reason and note stay as the record.
alter table implementations
  drop constraint if exists implementations_closure_shape_check,
  add constraint implementations_closure_shape_check check (
    (closed_at is null and closure_reason is null and closure_note is null and closed_by is null)
    or (
      closed_at is not null
      and closure_reason is not null
      and length(btrim(coalesce(closure_note, ''))) > 0
    )
  );

create index if not exists implementations_open_customer_idx
  on implementations (customer_id)
  where closed_at is null;

comment on column implementations.closed_at is
  'When the implementation was closed without graduating. Set only by portal_close_implementation(). Null while the implementation is open.';
comment on column implementations.closure_reason is
  'Why it was closed. One value for now: implementation_not_required.';

-- ---------------------------------------------------------------------------
-- Closing
-- ---------------------------------------------------------------------------

-- Closes one implementation. Authorised exactly like the existing team model:
-- a manager, an admin or a super admin; or the implementation's own owner when
-- that owner's role is a technical one (se, tam_se, implementation). Refuses a
-- second closure, and refuses any implementation that has graduated.
--
-- The app calls this with the service role, so auth.uid() is null here. The
-- acting profile is therefore passed in and checked against portal_profiles
-- itself, never trusted from the session.
create or replace function portal_close_implementation(
  p_implementation_id uuid,
  p_reason text,
  p_note text,
  p_actor_profile_id uuid
) returns implementations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_impl implementations%rowtype;
  v_role portal_user_role;
  v_actor_team uuid;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_actor_profile_id is null then
    raise exception 'closing an implementation needs the acting profile'
      using errcode = '42501';
  end if;

  select role, team_member_id into v_role, v_actor_team
    from portal_profiles where id = p_actor_profile_id;
  if not found then
    raise exception 'closing an implementation needs a known acting profile'
      using errcode = '42501';
  end if;

  if p_reason is distinct from 'implementation_not_required' then
    raise exception 'unknown closure reason: %', coalesce(p_reason, '(none)')
      using errcode = '22023';
  end if;

  if v_note = '' then
    raise exception 'a closure needs a short explanation'
      using errcode = '22023';
  end if;

  select * into v_impl from implementations where id = p_implementation_id for update;
  if not found then
    raise exception 'Implementation % not found', p_implementation_id
      using errcode = 'P0002';
  end if;

  if not (
    v_role::text in ('admin', 'super_admin', 'manager')
    or (
      v_role::text in ('se', 'tam_se', 'implementation')
      and v_actor_team is not null
      and v_impl.owner_id = v_actor_team
    )
  ) then
    raise exception 'forbidden: closing an implementation needs a manager, an admin, or the implementation specialist it is assigned to'
      using errcode = '42501';
  end if;

  if v_impl.closed_at is not null then
    raise exception 'Implementation % is already closed', p_implementation_id
      using errcode = '23505';
  end if;

  -- Graduation is never reached by closing. A graduated implementation cannot
  -- be closed, because closing would make a graduation look like a closure.
  if v_impl.current_stage in ('graduate-to-cs', 'graduate', 'cs')
     or exists (select 1 from graduations g where g.implementation_id = v_impl.id)
     or exists (
       select 1 from stage_instances si
        where si.implementation_id = v_impl.id
          and si.stage_key = 'roll_out'
          and si.status = 'done')
     or exists (
       select 1 from portal_accounts pa
        where pa.id = v_impl.deal_id
          and pa.stage = 'onboarding_complete') then
    raise exception 'Implementation % has graduated and cannot be closed', p_implementation_id
      using errcode = '22023';
  end if;

  update implementations
     set closed_at = now(),
         closed_by = p_actor_profile_id,
         closure_reason = p_reason,
         closure_note = v_note
   where id = p_implementation_id
  returning * into v_impl;

  insert into portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values (
    'user',
    p_actor_profile_id,
    'implementation.closed',
    'implementation',
    p_implementation_id,
    jsonb_build_object(
      'reason', p_reason,
      'stage_at_closure', v_impl.current_stage,
      'graduated', false
    )
  );

  return v_impl;
end $$;

revoke all on function portal_close_implementation(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function portal_close_implementation(uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The freeze
-- ---------------------------------------------------------------------------

-- Once closed, the lifecycle is frozen: no stage, owner, date, deal link,
-- journey or supersession change, and the closure itself is immutable. The
-- one allowed change to the closure is closed_by going null when its profile
-- is deleted (the foreign key does that, not a person).
create or replace function portal_closed_implementation_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.closed_at is null then
    return new;
  end if;

  if new.closed_at is distinct from old.closed_at
     or new.closure_reason is distinct from old.closure_reason
     or new.closure_note is distinct from old.closure_note
     or (new.closed_by is distinct from old.closed_by and new.closed_by is not null) then
    raise exception 'Implementation % is closed; its closure cannot be changed', old.id
      using errcode = '42501';
  end if;

  if new.current_stage is distinct from old.current_stage
     or new.stage_entered_at is distinct from old.stage_entered_at
     or new.owner_id is distinct from old.owner_id
     or new.status is distinct from old.status
     or new.deal_id is distinct from old.deal_id
     or new.journey_type is distinct from old.journey_type
     or new.partner_key is distinct from old.partner_key
     or new.superseded_by_implementation_id is distinct from old.superseded_by_implementation_id
     or new.target_launch_date is distinct from old.target_launch_date
     or new.target_date is distinct from old.target_date
     or new.go_live_at is distinct from old.go_live_at
     or new.actual_launch_date is distinct from old.actual_launch_date
     or new.baseline_date is distinct from old.baseline_date
     or new.tier_expected_date is distinct from old.tier_expected_date
     or new.complete_outcome is distinct from old.complete_outcome
     or new.complete_reason is distinct from old.complete_reason then
    raise exception 'Implementation % is closed: its stage, owner, dates and deal link are frozen', old.id
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists implementations_closed_guard_trg on implementations;
create trigger implementations_closed_guard_trg
  before update on implementations
  for each row execute function portal_closed_implementation_guard();

-- Stage progression rows belong to the implementation too. Once it is closed,
-- no stage instance is started, finished or added, and no history row is written.
create or replace function portal_closed_progression_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_impl uuid;
begin
  -- On a DELETE, NEW is unassigned; the row being removed is OLD.
  v_impl := case when tg_op = 'DELETE' then old.implementation_id else new.implementation_id end;
  if exists (select 1 from implementations where id = v_impl and closed_at is not null) then
    raise exception 'Implementation % is closed: stage progression is frozen', v_impl
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
begin
  if to_regclass('public.stage_instances') is not null then
    drop trigger if exists stage_instances_closed_guard_trg on stage_instances;
    create trigger stage_instances_closed_guard_trg
      before insert or update or delete on stage_instances
      for each row execute function portal_closed_progression_guard();
  end if;
  if to_regclass('public.implementation_stage_history') is not null then
    drop trigger if exists stage_history_closed_guard_trg on implementation_stage_history;
    create trigger stage_history_closed_guard_trg
      before insert or update or delete on implementation_stage_history
      for each row execute function portal_closed_progression_guard();
  end if;
end $$;
