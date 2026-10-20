-- Invariant probes for the approved ownership rules (0087), in one transaction.
-- Each outcome is checked against the rows it should leave, including the history.
-- Overlapping sessions are proven in 0087_ownership_concurrency.sh.
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

-- Fixtures. Team members: Ada and Ben are in the pool, Dee is in the pool with no login,
-- Cy is inactive. Profiles: one per role the rules name, plus sales and customer.
insert into customers (id, name) values ('00000000-0000-4000-8000-00000000c001', 'Ownership Customer');
insert into team_members (id, name, email, role, active) values
  ('00000000-0000-4000-8000-00000000a001', 'Ada', 'ada@gocanvas.com', 'am', true),
  ('00000000-0000-4000-8000-00000000a002', 'Ben', 'ben@gocanvas.com', 'se', true),
  ('00000000-0000-4000-8000-00000000a003', 'Cy',  'cy@gocanvas.com',  'se', false),
  ('00000000-0000-4000-8000-00000000a004', 'Dee', 'dee@gocanvas.com', 'se', true);
insert into portal_assignment_pool (team_member_id, active) values
  ('00000000-0000-4000-8000-00000000a001', true),
  ('00000000-0000-4000-8000-00000000a002', true),
  ('00000000-0000-4000-8000-00000000a004', true);
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000f001', 'ada@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f002', 'ben@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f004', 'dee@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f005', 'manager@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f006', 'sales@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f007', 'am2@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f008', 'admin@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f009', 'super@gocanvas.com'),
  ('00000000-0000-4000-8000-0000000000fa', 'tam@gocanvas.com'),
  ('00000000-0000-4000-8000-0000000000fb', 'impl@gocanvas.com'),
  ('00000000-0000-4000-8000-0000000000fc', 'onb@gocanvas.com'),
  ('00000000-0000-4000-8000-0000000000fd', 'customer@gocanvas.com');
-- Roles are set with the role guard off for these statements only; the transaction is rolled back.
alter table portal_profiles disable trigger portal_profiles_role_guard;
-- The first signup in a database becomes admin, so every fixture role is set explicitly.
update portal_profiles set role = 'am'          where id = '00000000-0000-4000-8000-00000000f001';
update portal_profiles set role = 'se'          where id = '00000000-0000-4000-8000-00000000f002';
update portal_profiles set role = 'sales'       where id = '00000000-0000-4000-8000-00000000f004';
update portal_profiles set role = 'manager'     where id = '00000000-0000-4000-8000-00000000f005';
update portal_profiles set role = 'sales'       where id = '00000000-0000-4000-8000-00000000f006';
update portal_profiles set role = 'am'          where id = '00000000-0000-4000-8000-00000000f007';
update portal_profiles set role = 'admin'       where id = '00000000-0000-4000-8000-00000000f008';
update portal_profiles set role = 'super_admin' where id = '00000000-0000-4000-8000-00000000f009';
update portal_profiles set role = 'tam_se'      where id = '00000000-0000-4000-8000-0000000000fa';
update portal_profiles set role = 'implementation' where id = '00000000-0000-4000-8000-0000000000fb';
update portal_profiles set role = 'onboarding'  where id = '00000000-0000-4000-8000-0000000000fc';
update portal_profiles set role = 'customer'    where id = '00000000-0000-4000-8000-0000000000fd';
alter table portal_profiles enable trigger portal_profiles_role_guard;

insert into portal_accounts (id, name, customer_id) values
  ('00000000-0000-4000-8000-00000000d001', 'Project unowned', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000d002', 'Project owned by Ben', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000d003', 'Pre-project unowned', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000d004', 'Pre-project, ledger says Ben', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000d007', 'Unowned, owned by a rule', '00000000-0000-4000-8000-00000000c001');

-- The fixture owners are written under a fixture context, which the history records.
-- The context is cleared below, so the guard is exercised by the probes.
select portal_owner_context(null, 'system'::text, 'rule_assignment'::text, 'test fixture');
insert into implementations (id, deal_id, customer_id, name, current_stage, owner_id) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001', 'P1', 'closed_won', null),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c001', 'P2', 'closed_won', '00000000-0000-4000-8000-00000000a002'),
  ('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-00000000d007', '00000000-0000-4000-8000-00000000c001', 'P7', 'closed_won', '00000000-0000-4000-8000-00000000a002');
insert into portal_assignments (deal_id, team_member_id, weight, source, created_at) values
  ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000a002', 1, 'manual'::text, '2020-01-01T00:00:00Z');
insert into portal_app_config (key, value) values
  ('assignment_rules', '{"mode":"claim","window_days":90,"base_points":1,"service_points":1,"arr_bands":[],"seat_bands":[],"integration_points":{}}');
select set_config('portal.owner_change', '', true);

-- ---------------------------------------------------------------------------
-- 1. Who may change an owner by hand: exactly admin, super admin and manager.
-- ---------------------------------------------------------------------------
select portal_set_implementation_owner('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000f008', 'Admin assigns', false, null);
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e001'),
  '00000000-0000-4000-8000-00000000a001'::uuid, 'an admin may assign an owner');
select portal_set_implementation_owner('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000a002',
  '00000000-0000-4000-8000-00000000f009', 'Super admin reassigns', false, null);
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e001'),
  '00000000-0000-4000-8000-00000000a002'::uuid, 'a super admin may reassign an owner');
select portal_set_implementation_owner('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000f005', 'Manager reassigns', false, null);
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e001'),
  '00000000-0000-4000-8000-00000000a001'::uuid, 'a manager may reassign an owner');

do $$
declare
  v_role_fails text[] := array[
    '00000000-0000-4000-8000-00000000f006', -- sales
    '00000000-0000-4000-8000-00000000f007', -- account manager
    '00000000-0000-4000-8000-0000000000fa', -- tam/se
    '00000000-0000-4000-8000-0000000000fb', -- implementation
    '00000000-0000-4000-8000-0000000000fc', -- onboarding
    '00000000-0000-4000-8000-0000000000fd', -- customer
    '00000000-0000-4000-8000-00000000f001'  -- ada, an employee who is not a manager
  ];
  v_who text;
begin
  foreach v_who in array v_role_fails loop
    begin
      perform portal_set_implementation_owner('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000a002',
        v_who::uuid, 'should be refused', false, null);
      raise exception 'INVARIANT NOT ENFORCED: profile % changed an owner', v_who;
    exception when others then
      if position('forbidden' in sqlerrm) = 0 then
        raise exception 'INVARIANT "non-managers refused" failed for %: %', v_who, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'ok — sales, account manager, tam/se, implementation, onboarding, customer and a plain employee are refused';
end $$;

select pg_temp.assert_refused(
  $q$select portal_set_implementation_owner('00000000-0000-4000-8000-00000000e001', null, null, 'no actor', false, null)$q$,
  'forbidden', 'a change with no signed-in actor is refused');

-- ---------------------------------------------------------------------------
-- 2. Accurate history: previous owner, new owner, actor, source, time.
-- ---------------------------------------------------------------------------
select pg_temp.assert_eq(
  (select count(*) from implementation_owner_history
    where implementation_id = '00000000-0000-4000-8000-00000000e001' and source = 'manager_assignment'::text),
  3::bigint, 'each assignment by an admin, a super admin or a manager writes one history row');
select pg_temp.assert_eq(
  (select row(previous_owner_id, new_owner_id, actor_profile_id, actor_kind, reason is not null, changed_at is not null)
     from implementation_owner_history
    where implementation_id = '00000000-0000-4000-8000-00000000e001' and source = 'manager_assignment'::text
    order by seq desc limit 1),
  row('00000000-0000-4000-8000-00000000a002'::uuid, '00000000-0000-4000-8000-00000000a001'::uuid,
      '00000000-0000-4000-8000-00000000f005'::uuid, 'user'::text, true, true),
  'the history names the previous owner, the new owner, the manager, and a time');

-- ---------------------------------------------------------------------------
-- 3. Clears: the new owner is null, and no person is invented for it.
-- ---------------------------------------------------------------------------
select portal_set_implementation_owner('00000000-0000-4000-8000-00000000e002', null,
  '00000000-0000-4000-8000-00000000f005', 'Cleared by manager', false, null);
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e002'), null::uuid,
  'a manager may clear an owner');
select pg_temp.assert_eq(
  (select row(previous_owner_id, new_owner_id, source)
     from implementation_owner_history
    where implementation_id = '00000000-0000-4000-8000-00000000e002' order by seq desc limit 1),
  row('00000000-0000-4000-8000-00000000a002'::uuid, null::uuid, 'clear'::text),
  'the clear is recorded with no new owner');
select pg_temp.assert_eq(
  (select count(*) from portal_assignments where implementation_id = '00000000-0000-4000-8000-00000000e002'),
  0::bigint, 'a clear writes no assignment record that would name a person');

-- ---------------------------------------------------------------------------
-- 4. An expected owner that no longer matches is refused: no blind overwrite.
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused(
  $q$select portal_set_implementation_owner('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-00000000a001',
     '00000000-0000-4000-8000-00000000f005', 'stale', true, null)$q$,
  'owner_changed', 'a reassignment made from a stale view is refused');

-- ---------------------------------------------------------------------------
-- 5. Claims in claim mode, and a refusal of a claim on an owned deal.
-- ---------------------------------------------------------------------------
select portal_claim_deal('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000f001', 1, '{}', 'Claimed by Ada');
select pg_temp.assert_eq(
  (select row(previous_owner_id, new_owner_id, actor_kind, source, actor_profile_id)
     from implementation_owner_history where deal_id = '00000000-0000-4000-8000-00000000d003' order by seq desc limit 1),
  row(null::uuid, '00000000-0000-4000-8000-00000000a001'::uuid, 'user'::text, 'claim'::text, '00000000-0000-4000-8000-00000000f001'::uuid),
  'a pre-project claim writes a history row with no project');
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000a004',
     '00000000-0000-4000-8000-00000000f004', 1, '{}', 'Dee claims')$q$,
  'already_owned', 'a second claim on a claimed deal is refused');
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d007', '00000000-0000-4000-8000-00000000a001',
     '00000000-0000-4000-8000-00000000f001', 1, '{}', 'Ada claims Bens')$q$,
  'already_owned', 'a claim on a project someone owns is refused');

-- ---------------------------------------------------------------------------
-- 6. Rules and integrations assign an unowned account only. Nothing replaces an owner.
-- ---------------------------------------------------------------------------
select pg_temp.assert_eq(
  (select (portal_record_assignment('00000000-0000-4000-8000-00000000d007', '00000000-0000-4000-8000-00000000a001',
             1, '{}', 'manual'::text, null, 'Named by Salesforce', 'unowned_only', 'integration'::text))->>'assigned'),
  'false', 'an integration naming an owner does not replace the Hub owner');
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e007'),
  '00000000-0000-4000-8000-00000000a002'::uuid, 'the Hub owner is unchanged by the integration');
do $$
declare v_before bigint; v_after bigint;
begin
  select count(*) into v_before from implementation_owner_history where implementation_id = '00000000-0000-4000-8000-00000000e007';
  perform portal_record_assignment('00000000-0000-4000-8000-00000000d007', '00000000-0000-4000-8000-00000000a001',
    1, '{}', 'manual'::text, null, 'Named by Salesforce', 'unowned_only', 'integration'::text);
  select count(*) into v_after from implementation_owner_history where implementation_id = '00000000-0000-4000-8000-00000000e007';
  if v_after <> v_before then
    raise exception 'INVARIANT "a refused integration assignment writes no history" failed: % -> %', v_before, v_after;
  end if;
  raise notice 'ok — a refused integration assignment writes no history';
end $$;
select pg_temp.assert_refused(
  $q$select portal_record_assignment('00000000-0000-4000-8000-00000000d007', '00000000-0000-4000-8000-00000000a001',
     1, '{}', 'manual'::text, '00000000-0000-4000-8000-00000000f006', 'Sales tries', 'manager', 'user'::text)$q$,
  'forbidden', 'a sales user cannot assign an owner by hand');
select pg_temp.assert_eq(
  (select (portal_record_assignment('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000a004',
             1, '{}', 'auto', null, 'Rule picks', 'unowned_only', 'system'::text))->>'assigned'),
  'false', 'a rule does not take a deal that the ledger already gives to someone');

-- ---------------------------------------------------------------------------
-- 7. Salesforce: a created project may take the named owner; a superseded one keeps the Hub's.
-- ---------------------------------------------------------------------------
select sf_create_implementation(
  '00000000-0000-4000-8000-00000000c001',
  '{"name":"SF create","owner_id":"00000000-0000-4000-8000-00000000a004"}'::jsonb,
  null, 'SF-OPP-1', 'SF-ACC-1', now(), null);
select pg_temp.assert_eq(
  (select row(h.previous_owner_id, h.new_owner_id, h.actor_kind, h.source)
     from implementation_owner_history h
     join implementations i on i.id = h.implementation_id
    where i.salesforce_opportunity_id = 'SF-OPP-1' order by h.seq desc limit 1),
  row(null::uuid, '00000000-0000-4000-8000-00000000a004'::uuid, 'integration'::text, 'salesforce_create'::text),
  'a project created from Salesforce is recorded as an integration assignment');

-- The follow-on keeps the Hub's owner. The owner the payload names is not used.
select sf_supersede_implementation(
  (select id from implementations where salesforce_opportunity_id = 'SF-OPP-1'),
  '{"name":"Follow-on","owner_id":"00000000-0000-4000-8000-00000000a002"}'::jsonb,
  'Renewal scope', null);
select pg_temp.assert_eq(
  (select owner_id from implementations where salesforce_opportunity_id = 'SF-OPP-1' and superseded_by_implementation_id is null),
  '00000000-0000-4000-8000-00000000a004'::uuid, 'a superseded project keeps the owner it had');
select pg_temp.assert_eq(
  (select row(new_owner_id, source) from implementation_owner_history
    where implementation_id = (select id from implementations where salesforce_opportunity_id = 'SF-OPP-1' and superseded_by_implementation_id is null)
    order by seq desc limit 1),
  row('00000000-0000-4000-8000-00000000a004'::uuid, 'salesforce_supersede'::text),
  'the follow-on records the carried owner as a supersede');
select pg_temp.assert_refused(
  $q$select portal_set_implementation_owner((select id from implementations where salesforce_opportunity_id = 'SF-OPP-1' and superseded_by_implementation_id is not null),
     '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000f005', 'old one', false, null)$q$,
  'superseded', 'the superseded project cannot be reassigned');

-- ---------------------------------------------------------------------------
-- 8. Onboarding inheritance: a cleared deal carries nothing; a ledger owner is carried.
-- ---------------------------------------------------------------------------
insert into implementations (id, deal_id, customer_id, name, current_stage) values
  ('00000000-0000-4000-8000-00000000e008', '00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c001', 'P2 again', 'closed_won');
select pg_temp.assert_eq(
  portal_inherit_pre_project_owner('00000000-0000-4000-8000-00000000e008'), false,
  'a cleared deal carries no owner into its new project');
insert into implementations (id, deal_id, customer_id, name, current_stage) values
  ('00000000-0000-4000-8000-00000000e009', '00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000c001', 'P4', 'closed_won');
select pg_temp.assert_eq(
  portal_inherit_pre_project_owner('00000000-0000-4000-8000-00000000e009'), true,
  'a new project takes the owner its deal has in the ledger');
select pg_temp.assert_eq(
  (select row(previous_owner_id, new_owner_id, source) from implementation_owner_history
    where implementation_id = '00000000-0000-4000-8000-00000000e009' order by seq desc limit 1),
  row(null::uuid, '00000000-0000-4000-8000-00000000a002'::uuid, 'inherit'::text),
  'the inheritance is recorded as an inherit');

-- ---------------------------------------------------------------------------
-- 9. Deactivation: a person who owns anything, claimed or assigned, cannot be removed.
--    Gus has no login, so the login rule does not decide the outcome.
-- ---------------------------------------------------------------------------
insert into team_members (id, name, email, role, active) values
  ('00000000-0000-4000-8000-00000000a006', 'Gus', 'gus@gocanvas.com', 'se', true),
  ('00000000-0000-4000-8000-00000000a005', 'Fay', 'fay@gocanvas.com', 'se', true);
insert into portal_assignment_pool (team_member_id, active) values
  ('00000000-0000-4000-8000-00000000a006', true),
  ('00000000-0000-4000-8000-00000000a005', true);
insert into portal_accounts (id, name, customer_id) values
  ('00000000-0000-4000-8000-00000000d008', 'Pre-project for Gus', '00000000-0000-4000-8000-00000000c001');
select portal_record_assignment('00000000-0000-4000-8000-00000000d008', '00000000-0000-4000-8000-00000000a006',
  1, '{}', 'manual', '00000000-0000-4000-8000-00000000f005', 'Chosen by hand', 'manager', 'user');
select pg_temp.assert_refused(
  $q$select portal_deactivate_team_member('00000000-0000-4000-8000-00000000a006', '00000000-0000-4000-8000-00000000f005')$q$,
  'still owns', 'a person who is the owner of a deal with no project cannot be removed');
select pg_temp.assert_refused(
  $q$select portal_deactivate_team_member('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000f006')$q$,
  'forbidden', 'a sales user cannot remove a team member');
select pg_temp.assert_eq(
  portal_deactivate_team_member('00000000-0000-4000-8000-00000000a005', '00000000-0000-4000-8000-00000000f005')->>'name',
  'Fay', 'a manager may remove a person who owns nothing');
select pg_temp.assert_eq(
  (select active from team_members where id = '00000000-0000-4000-8000-00000000a005'), false,
  'the removed person is inactive');
select pg_temp.assert_eq(
  (select count(*) from portal_assignment_pool where team_member_id = '00000000-0000-4000-8000-00000000a005'),
  0::bigint, 'the removed person leaves the rotation');

-- ---------------------------------------------------------------------------
-- 10. History is append-only.
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused(
  $q$update implementation_owner_history set reason = 'rewritten' where true$q$,
  'append-only', 'a history row cannot be rewritten');
select pg_temp.assert_refused(
  $q$delete from implementation_owner_history where true$q$,
  'append-only', 'a history row cannot be deleted');

-- ---------------------------------------------------------------------------
-- 11. The guard: an owner cannot be changed outside the ownership functions.
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused(
  $q$update implementations set owner_id = '00000000-0000-4000-8000-00000000a001' where id = '00000000-0000-4000-8000-00000000e007'$q$,
  'owner_change_not_authorised', 'a direct owner change is refused');
select pg_temp.assert_refused(
  $q$insert into implementations (deal_id, customer_id, name, current_stage, owner_id)
     values ('00000000-0000-4000-8000-00000000d007', '00000000-0000-4000-8000-00000000c001', 'Direct insert', 'closed_won', '00000000-0000-4000-8000-00000000a001')$q$,
  'owner_change_not_authorised', 'a project created with an owner outside the functions is refused');
do $$
begin
  update implementations set owner_id = '00000000-0000-4000-8000-00000000a002'
   where id = '00000000-0000-4000-8000-00000000e007';
  raise notice 'ok — a save that resends the current owner is not a change and passes';
end $$;
select pg_temp.assert_eq(
  (select count(*) from pg_policies
    where tablename in ('team_members', 'portal_assignment_pool', 'portal_assignments', 'implementation_owner_history')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  0::bigint, 'no internal login can write the team, the pool, the ledger or the history through the REST API');
select pg_temp.assert_eq(
  has_table_privilege('authenticated', 'implementation_owner_history', 'insert')
    or has_table_privilege('authenticated', 'portal_assignments', 'insert'),
  false, 'internal logins cannot write the history or the ledger directly');

-- ---------------------------------------------------------------------------
-- 12. A failed write rolls back the owner and its history together.
-- ---------------------------------------------------------------------------
do $$
declare v_before bigint; v_after bigint; v_owner uuid;
begin
  select count(*) into v_before from implementation_owner_history where implementation_id = '00000000-0000-4000-8000-00000000e001';
  begin
    perform portal_record_assignment('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a002',
      -1, '{}', 'manual'::text, '00000000-0000-4000-8000-00000000f005', 'bad weight', 'manager', 'user'::text);
    raise exception 'INVARIANT NOT ENFORCED: a negative weight was accepted';
  exception when check_violation then
    null;
  end;
  select count(*) into v_after from implementation_owner_history where implementation_id = '00000000-0000-4000-8000-00000000e001';
  select owner_id into v_owner from implementations where id = '00000000-0000-4000-8000-00000000e001';
  if v_after <> v_before then
    raise exception 'INVARIANT "a failed assignment leaves no history" failed: % -> %', v_before, v_after;
  end if;
  if v_owner is distinct from '00000000-0000-4000-8000-00000000a001'::uuid then
    raise exception 'INVARIANT "a failed assignment leaves the owner unchanged" failed: %', v_owner;
  end if;
  raise notice 'ok — a failed assignment leaves the owner and its history unchanged';
end $$;

select 'ownership probes complete' as result;
rollback;
