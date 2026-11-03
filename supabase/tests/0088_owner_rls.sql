-- Row-level security and privileges for the owner tables, exercised as the roles a
-- request really runs under. Each probe sets the request JWT and the role the way
-- PostgREST does for a signed-in user, then checks what that role may see and write.
-- Policy definitions are not inspected here: the statements are run and their results
-- checked. One transaction, rolled back.
begin;

create function pg_temp.assert_eq(p_got anyelement, p_want anyelement, p_what text)
returns void language plpgsql as $fn$
begin
  if p_got is distinct from p_want then
    raise exception 'INVARIANT "%" failed: got %, want %', p_what, p_got, p_want;
  end if;
  raise notice 'ok — %', p_what;
end $fn$;

create function pg_temp.assert_refused(p_sql text, p_fragment text, p_what text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'INVARIANT "%" refused for the wrong reason: %', p_what, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT NOT ENFORCED: % was allowed', p_what;
end $fn$;

-- Runs the following statements as a request under this role and profile.
create function pg_temp.act_as(p_role text, p_sub uuid) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role, 'sub', p_sub)::text, true);
  execute format('set local role %I', p_role);
end $fn$;

create function pg_temp.act_as_owner() returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $fn$;

-- The guard refuses direct owner writes in enforce mode, which is the target configuration.
update portal_app_config set value = '{"mode":"enforce"}' where key = 'owner_guard';

-- Fixtures, written as the owner of the tables.
insert into customers (id, name) values ('00000000-0000-4000-8000-00000000c901', 'RLS Customer');
insert into team_members (id, name, email, role, active) values
  ('00000000-0000-4000-8000-00000000a901', 'Ann', 'ann.rls@gocanvas.com', 'se', true),
  ('00000000-0000-4000-8000-00000000a902', 'Bo',  'bo.rls@gocanvas.com',  'se', true);
insert into portal_assignment_pool (team_member_id, active) values
  ('00000000-0000-4000-8000-00000000a901', true), ('00000000-0000-4000-8000-00000000a902', true);
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000f901', 'sales.rls@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f902', 'manager.rls@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f903', 'customer.rls@gocanvas.com');
alter table portal_profiles disable trigger portal_profiles_role_guard;
update portal_profiles set role = 'sales'    where id = '00000000-0000-4000-8000-00000000f901';
update portal_profiles set role = 'manager'  where id = '00000000-0000-4000-8000-00000000f902';
update portal_profiles set role = 'customer' where id = '00000000-0000-4000-8000-00000000f903';
alter table portal_profiles enable trigger portal_profiles_role_guard;

insert into portal_accounts (id, name, customer_id) values
  ('00000000-0000-4000-8000-00000000d901', 'RLS deal', '00000000-0000-4000-8000-00000000c901');
select portal_owner_context(null, 'system', 'rule_assignment', 'rls fixture');
insert into implementations (id, deal_id, customer_id, name, current_stage, owner_id) values
  ('00000000-0000-4000-8000-00000000e901', '00000000-0000-4000-8000-00000000d901',
   '00000000-0000-4000-8000-00000000c901', 'RLS project', 'closed_won', '00000000-0000-4000-8000-00000000a901');
select set_config('portal.owner_change', '', true);
insert into portal_assignments (deal_id, team_member_id, weight, source, created_at) values
  ('00000000-0000-4000-8000-00000000d901', '00000000-0000-4000-8000-00000000a901', 1, 'manual', '2020-01-01T00:00:00Z');

-- ---------------------------------------------------------------------------
-- 1. An internal login (sales) reads the owner tables and cannot write them.
-- ---------------------------------------------------------------------------
select pg_temp.act_as('authenticated', '00000000-0000-4000-8000-00000000f901');
select pg_temp.assert_eq((select count(*) > 0 from implementation_owner_history), true,
  'an internal login reads the owner history');
select pg_temp.assert_eq((select count(*) > 0 from team_members), true,
  'an internal login reads the team');
select pg_temp.assert_eq((select count(*) > 0 from portal_assignments), true,
  'an internal login reads the assignment ledger');
select pg_temp.assert_refused(
  $q$insert into portal_assignments (deal_id, team_member_id, weight, source)
     values ('00000000-0000-4000-8000-00000000d901', '00000000-0000-4000-8000-00000000a902', 1, 'manual')$q$,
  'permission denied', 'an internal login cannot write the assignment ledger');
select pg_temp.assert_refused(
  $q$insert into implementation_owner_history (implementation_id, actor_kind, source)
     values ('00000000-0000-4000-8000-00000000e901', 'user', 'manager_assignment')$q$,
  'permission denied', 'an internal login cannot forge an owner history row');
select pg_temp.assert_refused(
  $q$update implementation_owner_history set reason = 'changed'$q$,
  'permission denied', 'an internal login cannot change the owner history');
select pg_temp.assert_refused(
  $q$update team_members set active = false where id = '00000000-0000-4000-8000-00000000a902'$q$,
  'permission denied', 'an internal login cannot deactivate a team member');
select pg_temp.assert_refused(
  $q$delete from portal_assignment_pool where team_member_id = '00000000-0000-4000-8000-00000000a902'$q$,
  'permission denied', 'an internal login cannot change the claim pool');
select pg_temp.assert_refused(
  $q$update implementations set owner_id = '00000000-0000-4000-8000-00000000a902'
     where id = '00000000-0000-4000-8000-00000000e901'$q$,
  'owner_change_not_authorised', 'an internal login cannot change an owner directly');
do $$
declare v_rows int;
begin
  update implementations set name = 'Renamed by sales'
   where id = '00000000-0000-4000-8000-00000000e901';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'INVARIANT "an ordinary edit still saves" failed: % rows', v_rows;
  end if;
  raise notice 'ok — an internal login still saves the other details of a project';
end $$;
select pg_temp.assert_refused(
  $q$select portal_set_implementation_owner('00000000-0000-4000-8000-00000000e901',
     '00000000-0000-4000-8000-00000000a902', '00000000-0000-4000-8000-00000000f901', 'x', false, null)$q$,
  'permission denied', 'an internal login cannot call the owner function');
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d901', '00000000-0000-4000-8000-00000000a902',
     '00000000-0000-4000-8000-00000000f901', 1, '{}', 'x')$q$,
  'permission denied', 'an internal login cannot call the claim function directly');
select pg_temp.assert_refused(
  $q$select portal_deactivate_team_member('00000000-0000-4000-8000-00000000a902', '00000000-0000-4000-8000-00000000f901')$q$,
  'permission denied', 'an internal login cannot call the removal function directly');
select pg_temp.assert_refused(
  $q$select sf_create_implementation('00000000-0000-4000-8000-00000000c901', '{"name":"x"}'::jsonb,
     null, 'SF-RLS-1', 'SF-ACC-RLS', now(), null)$q$,
  'permission denied', 'an internal login cannot call the Salesforce creation function (0023 grants it to the server only)');
select pg_temp.act_as_owner();

-- ---------------------------------------------------------------------------
-- 2. A manager reads the history, but the owner still changes only through the function,
--    which the REST role cannot call. The server calls it with the service role.
-- ---------------------------------------------------------------------------
select pg_temp.act_as('authenticated', '00000000-0000-4000-8000-00000000f902');
select pg_temp.assert_eq((select count(*) > 0 from implementation_owner_history), true,
  'a manager reads the owner history');
select pg_temp.assert_refused(
  $q$update implementations set owner_id = '00000000-0000-4000-8000-00000000a902'
     where id = '00000000-0000-4000-8000-00000000e901'$q$,
  'owner_change_not_authorised', 'a manager cannot change an owner directly, only through the function');
select pg_temp.assert_refused(
  $q$select portal_set_implementation_owner('00000000-0000-4000-8000-00000000e901',
     '00000000-0000-4000-8000-00000000a902', '00000000-0000-4000-8000-00000000f902', 'x', false, null)$q$,
  'permission denied', 'a manager reaches the owner function only through the server');
select pg_temp.act_as_owner();

-- ---------------------------------------------------------------------------
-- 3. A customer login reads none of it.
-- ---------------------------------------------------------------------------
select pg_temp.act_as('authenticated', '00000000-0000-4000-8000-00000000f903');
select pg_temp.assert_eq((select count(*) from implementation_owner_history), 0::bigint,
  'a customer login sees no owner history');
select pg_temp.assert_eq((select count(*) from team_members), 0::bigint,
  'a customer login sees no team');
select pg_temp.assert_eq((select count(*) from portal_assignments), 0::bigint,
  'a customer login sees no assignment ledger');
do $$
declare v_rows int;
begin
  update implementations set owner_id = null where id = '00000000-0000-4000-8000-00000000e901';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'INVARIANT "a customer login changes no project" failed: % rows', v_rows;
  end if;
  raise notice 'ok — a customer login changes no project';
end $$;
select pg_temp.act_as_owner();

-- ---------------------------------------------------------------------------
-- 4. The anonymous role reads and writes none of it.
-- ---------------------------------------------------------------------------
select pg_temp.act_as('anon', null);
select pg_temp.assert_refused(
  $q$select count(*) from implementation_owner_history$q$,
  'permission denied', 'an anonymous request cannot read the owner history');
select pg_temp.assert_refused(
  $q$select count(*) from team_members$q$,
  'permission denied', 'an anonymous request cannot read the team');
select pg_temp.act_as_owner();

-- The owner stayed where it was through every refused attempt.
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e901'),
  '00000000-0000-4000-8000-00000000a901'::uuid, 'the owner is unchanged by every request above');

select 'owner row-level security probes complete' as result;
rollback;
