-- Invariant probes for the delivery-side actor column (0037).
--
-- WHAT WENT WRONG AND WHY NOTHING CAUGHT IT. `work_items.completed_by` FK'd to
-- `portal_profiles` while every neighbouring actor column FK'd to
-- `team_members`. The app resolved the actor to a team_member id — correct for
-- the neighbours — and the write failed on every attempt. 115 rows sat at
-- status='done' with completed_by null and nothing anywhere said so, because
-- seeds and migrations never set an actor and therefore never hit the
-- constraint.
--
-- So the probe is not "does the column exist". It is: can a team member
-- actually be recorded as having completed something, and is a login-less staff
-- member — eleven of the thirteen — still a valid actor.
--
-- Runs inside one transaction and rolls back. Requires ON_ERROR_STOP=1.

begin;

create function pg_temp.assert_refused(p_sql text, p_fragment text, p_what text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'INVARIANT "%" was refused, but for the wrong reason. Expected "%", got: %',
        p_what, p_fragment, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT NOT ENFORCED: % was allowed', p_what;
end $fn$;

insert into customers (id, name)
  values ('77777777-1111-4111-8111-000000000001', 'Actor Probe Co');
insert into implementations (id, customer_id, name, current_stage, stage_entered_at)
  values ('77777777-2222-4222-8222-000000000001',
          '77777777-1111-4111-8111-000000000001', 'Actor probe', 'handoff', now());

-- A staff member with NO login. This is the ordinary case: eleven of thirteen.
insert into team_members (id, name, role, email)
  values ('77777777-3333-4333-8333-000000000001', 'Probe TIS', 'TIS', 'probe.tis@invariants.test');

insert into work_items (id, implementation_id, title, position)
  values ('77777777-4444-4444-8444-000000000001',
          '77777777-2222-4222-8222-000000000001', 'Tick me', 1);

-- ---------------------------------------------------------------------------
-- The thing that was impossible
-- ---------------------------------------------------------------------------
do $$
declare v_who uuid;
begin
  update work_items
     set status = 'done', completed_at = now(),
         completed_by = '77777777-3333-4333-8333-000000000001'
   where id = '77777777-4444-4444-8444-000000000001'
  returning completed_by into v_who;

  if v_who is null then
    raise exception 'INVARIANT NOT ENFORCED: the actor was not recorded';
  end if;
  raise notice 'ok — a team member with no login can complete a work item';
end $$;

-- ---------------------------------------------------------------------------
-- The three delivery actor columns agree on one table
-- ---------------------------------------------------------------------------
-- This is the invariant the bug violated. If a later migration repoints any one
-- of them, the app resolves an actor for the wrong table again and the failure
-- reappears at exactly one call site — which is how it hid the first time.
do $$
declare v_bad text;
begin
  select string_agg(format('%s.%s -> %s', tc.table_name, kcu.column_name, ccu.table_name), ', ')
    into v_bad
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
   where tc.constraint_type = 'FOREIGN KEY'
     and ((tc.table_name = 'work_items' and kcu.column_name in ('completed_by', 'owner_id'))
       or (tc.table_name = 'implementation_stage_history' and kcu.column_name = 'entered_by'))
     and ccu.table_name <> 'team_members';

  if v_bad is not null then
    raise exception
      'INVARIANT NOT ENFORCED: delivery actor column(s) point somewhere other than team_members: %',
      v_bad;
  end if;
  raise notice 'ok — completed_by, owner_id and entered_by all name team_members';
end $$;

-- An id that is not a team member is still refused. The column is a real
-- reference, not a free-text field that happens to hold uuids.
select pg_temp.assert_refused(
  $q$update work_items set completed_by = '00000000-0000-4000-8000-0000000000ff'
      where id = '77777777-4444-4444-8444-000000000001'$q$,
  'work_items_completed_by_fkey',
  'recording a completion by somebody who is not on the team');

-- Removing a staff member leaves the work, and forgets the actor. Cascading
-- here would delete a customer's plan because somebody left the company.
do $$
declare v_status text; v_who uuid;
begin
  delete from team_members where id = '77777777-3333-4333-8333-000000000001';
  select status, completed_by into v_status, v_who
    from work_items where id = '77777777-4444-4444-8444-000000000001';
  if v_status is null then
    raise exception 'INVARIANT NOT ENFORCED: the work item went with the team member';
  end if;
  if v_who is not null then
    raise exception 'INVARIANT NOT ENFORCED: completed_by still names a deleted team member';
  end if;
  raise notice 'ok — a departing team member nulls the actor and keeps the work';
end $$;

rollback;
