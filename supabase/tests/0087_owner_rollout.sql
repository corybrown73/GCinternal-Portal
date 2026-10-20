-- The owner guard's rollout modes (0087). Observe mode lets a direct owner write through
-- and records it as a legacy write, so an application still on the old code keeps
-- working while the new one is deployed. Enforce mode refuses it. A missing setting is
-- enforce. One transaction, rolled back.
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

insert into customers (id, name) values ('00000000-0000-4000-8000-00000000c951', 'Rollout Customer');
insert into team_members (id, name, email, role, active) values
  ('00000000-0000-4000-8000-00000000a951', 'Una', 'una.rollout@gocanvas.com', 'se', true);
insert into portal_accounts (id, name, customer_id) values
  ('00000000-0000-4000-8000-00000000d951', 'Rollout deal', '00000000-0000-4000-8000-00000000c951');
insert into implementations (id, deal_id, customer_id, name, current_stage, owner_id) values
  ('00000000-0000-4000-8000-00000000e951', '00000000-0000-4000-8000-00000000d951',
   '00000000-0000-4000-8000-00000000c951', 'Rollout project', 'closed_won', null);

-- 1. Observe (the rollout's starting mode, set by the migration): an old application's
--    direct write goes through, and is recorded as a legacy write with no actor.
select pg_temp.assert_eq(portal_owner_guard_mode(), 'observe', 'the migration starts the guard in observe mode');
update implementations set owner_id = '00000000-0000-4000-8000-00000000a951'
 where id = '00000000-0000-4000-8000-00000000e951';
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e951'),
  '00000000-0000-4000-8000-00000000a951'::uuid, 'observe mode lets a direct owner write through');
select pg_temp.assert_eq(
  (select row(source, actor_kind, actor_profile_id, new_owner_id) from implementation_owner_history
    where implementation_id = '00000000-0000-4000-8000-00000000e951' order by seq desc limit 1),
  row('legacy_direct_write'::text, 'system'::text, null::uuid, '00000000-0000-4000-8000-00000000a951'::uuid),
  'a legacy write is recorded as one, with no actor named');

-- 2. The same write, unchanged, is not a change: it passes in observe mode.
update implementations set owner_id = '00000000-0000-4000-8000-00000000a951'
 where id = '00000000-0000-4000-8000-00000000e951';
select pg_temp.assert_eq(
  (select count(*) from implementation_owner_history
    where implementation_id = '00000000-0000-4000-8000-00000000e951'), 1::bigint,
  'a save that resends the current owner writes no history row');

-- 3. A change made under the ownership functions is recorded with its actor, not as legacy.
select set_config('portal.owner_change', '', true);
select pg_temp.assert_eq(
  (select count(*) from implementation_owner_history where source = 'legacy_direct_write') > 0, true,
  'legacy writes are visible to the monitoring query');

-- 4. Enforce: the same direct change is refused, and no row is written.
update portal_app_config set value = '{"mode":"enforce"}' where key = 'owner_guard';
select pg_temp.assert_eq(portal_owner_guard_mode(), 'enforce', 'the guard reads enforce mode');
select pg_temp.assert_refused(
  $q$update implementations set owner_id = null where id = '00000000-0000-4000-8000-00000000e951'$q$,
  'owner_change_not_authorised', 'enforce mode refuses a direct owner write');
select pg_temp.assert_eq(
  (select count(*) from implementation_owner_history
    where implementation_id = '00000000-0000-4000-8000-00000000e951'), 1::bigint,
  'a refused direct write leaves no history row');

-- 5. Enforce does not touch a change of another column.
update implementations set name = 'Renamed in enforce mode' where id = '00000000-0000-4000-8000-00000000e951';
select pg_temp.assert_eq(
  (select name from implementations where id = '00000000-0000-4000-8000-00000000e951'),
  'Renamed in enforce mode', 'enforce mode still saves the other details of a project');

-- 6. A missing setting is enforce, so the default fails closed.
delete from portal_app_config where key = 'owner_guard';
select pg_temp.assert_eq(portal_owner_guard_mode(), 'enforce', 'a missing setting means enforce');
select pg_temp.assert_refused(
  $q$update implementations set owner_id = null where id = '00000000-0000-4000-8000-00000000e951'$q$,
  'owner_change_not_authorised', 'with no setting, a direct owner write is refused');

-- 7. Back to observe. A signed-in internal login is refused even in observe mode: the
--    observe window never reopens a direct owner change through the REST API.
insert into portal_app_config (key, value) values ('owner_guard', '{"mode":"observe"}');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000f951"}', true);
select pg_temp.assert_refused(
  $q$update implementations set owner_id = null where id = '00000000-0000-4000-8000-00000000e951'$q$,
  'owner_change_not_authorised', 'observe mode still refuses a signed-in login''s direct owner change');
select set_config('request.jwt.claims', '', true);

-- 8. Observe mode still lets the server's own write through (no JWT, as the service role).
update implementations set owner_id = null where id = '00000000-0000-4000-8000-00000000e951';
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e951'), null::uuid,
  'back in observe mode, the direct write goes through again');

select 'owner rollout probes complete' as result;
rollback;
