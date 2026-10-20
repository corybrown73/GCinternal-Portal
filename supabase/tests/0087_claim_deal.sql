-- Invariant probes for the transactional claiming functions (0087).
-- Single-session: each outcome is checked against the rows it should leave. The
-- overlapping sessions are proven separately, in 0087_claim_deal_concurrency.sh.
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

-- Fixtures. A and B are active pool members, C is inactive, D is not in the pool.
insert into customers (id, name) values
  ('00000000-0000-4000-8000-00000000c001', 'Probe Customer');
insert into team_members (id, name, email, role, active) values
  ('00000000-0000-4000-8000-00000000a001', 'Ada', 'ada@gocanvas.com', 'am', true),
  ('00000000-0000-4000-8000-00000000a002', 'Ben', 'ben@gocanvas.com', 'se', true),
  ('00000000-0000-4000-8000-00000000a003', 'Cy',  'cy@gocanvas.com',  'se', false),
  ('00000000-0000-4000-8000-00000000a004', 'Dee', 'dee@gocanvas.com', 'se', true);
insert into portal_assignment_pool (team_member_id, active) values
  ('00000000-0000-4000-8000-00000000a001', true),
  ('00000000-0000-4000-8000-00000000a002', true),
  ('00000000-0000-4000-8000-00000000a003', true);
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000f001', 'ada@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f002', 'ben@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f003', 'cy@gocanvas.com'),
  ('00000000-0000-4000-8000-00000000f004', 'dee@gocanvas.com');
-- portal_profiles rows are created by the signup trigger from auth.users, as in production.

-- Four deals: 1 pre-project and unowned; 2 with a project that has no owner; 3
-- with a project owned by Ben; 4 pre-project, claimed by Ben in the ledger.
insert into portal_accounts (id, name, customer_id) values
  ('00000000-0000-4000-8000-00000000d001', 'Pre-project unowned', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000d002', 'Project unowned', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000d003', 'Project owned', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000d004', 'Pre-project owned', '00000000-0000-4000-8000-00000000c001');
insert into implementations (id, deal_id, customer_id, name, current_stage, owner_id) values
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c001', 'P2', 'closed_won', null),
  ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000c001', 'P3', 'closed_won', '00000000-0000-4000-8000-00000000a002');
-- now() is the same for every statement in one transaction, so the fixture record is
-- dated in the past: the records written below are then the newest.
insert into portal_assignments (deal_id, team_member_id, weight, source, created_at) values
  ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000a002', 1, 'manual', '2020-01-01T00:00:00Z');

insert into portal_app_config (key, value) values
  ('assignment_rules', '{"mode":"claim","window_days":90,"base_points":1,"service_points":1,"arr_bands":[],"seat_bands":[],"integration_points":{}}');

-- 1. A pre-project claim by an eligible employee succeeds, and writes one record.
select pg_temp.assert_eq(
  (select count(*) from portal_assignments where deal_id = '00000000-0000-4000-8000-00000000d001'), 0::bigint,
  'a pre-project deal starts with no record');
select portal_claim_deal('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000f001', 2, '{}', 'Claimed by Ada');
select pg_temp.assert_eq(
  (select team_member_id from portal_assignments where deal_id = '00000000-0000-4000-8000-00000000d001'),
  '00000000-0000-4000-8000-00000000a001'::uuid, 'a pre-project claim is recorded for the claimant');
select pg_temp.assert_eq(
  (select count(*) from portal_assignments where deal_id = '00000000-0000-4000-8000-00000000d001'), 1::bigint,
  'a pre-project claim writes exactly one record');

-- 2. A claim on a deal with a project, which has no owner, sets the project's owner and records it.
select portal_claim_deal('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000f001', 2, '{}', 'Claimed by Ada');
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e002'),
  '00000000-0000-4000-8000-00000000a001'::uuid, 'a claim after the project exists sets the project owner');
select pg_temp.assert_eq(
  (select implementation_id from portal_assignments where deal_id = '00000000-0000-4000-8000-00000000d002'),
  '00000000-0000-4000-8000-00000000e002'::uuid, 'the record names the project it was made on');

-- 3. An owned deal cannot be claimed, and the refusal writes nothing.
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000f001', 2, '{}', null)$q$,
  'already_owned', 'a claim on a project owned by someone else is refused');
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e003'),
  '00000000-0000-4000-8000-00000000a002'::uuid, 'the refused claim leaves the owner in place');
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000f001', 2, '{}', null)$q$,
  'already_owned', 'a claim on a pre-project deal already in the ledger is refused');

-- 4. Eligibility: not in the pool, inactive, or signed in as someone else.
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000f004', 2, '{}', null)$q$,
  'not_in_pool', 'an employee who is not in the pool cannot claim');
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000f003', 2, '{}', null)$q$,
  'not_in_pool', 'an inactive team member cannot claim');
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000f001', 2, '{}', null)$q$,
  'not_in_pool', 'a claim cannot name a team member other than the signed-in person');

-- 5. Rules: missing, auto and invalid all refuse. A deal is never claimed under them.
delete from portal_app_config where key = 'assignment_rules';
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000f002', 2, '{}', null)$q$,
  'rules_missing', 'missing rules refuse a claim');
insert into portal_app_config (key, value) values ('assignment_rules', '{"mode":"auto"}');
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000f002', 2, '{}', null)$q$,
  'rules_auto', 'manager-assignment mode refuses a claim');
update portal_app_config set value = '{"mode":"Claim"}' where key = 'assignment_rules';
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000f002', 2, '{}', null)$q$,
  'rules_invalid', 'an invalid stored mode refuses a claim');
update portal_app_config set value = '"claim"' where key = 'assignment_rules';
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000f002', 2, '{}', null)$q$,
  'rules_invalid', 'a stored value that is not an object refuses a claim');
update portal_app_config set value = '{"mode":"claim","window_days":90,"base_points":1,"service_points":1,"arr_bands":[],"seat_bands":[],"integration_points":{}}'
  where key = 'assignment_rules';

-- 6. A failed write leaves no partial ownership and no record. A negative weight
--    fails the record insert after the owner was written; the whole call must roll back.
--    Deal 5 is a fresh, unowned project, so the only thing that can fail is the write.
insert into portal_accounts (id, name, customer_id) values
  ('00000000-0000-4000-8000-00000000d005', 'Project unowned, failing write', '00000000-0000-4000-8000-00000000c001');
insert into implementations (id, deal_id, customer_id, name, current_stage, owner_id) values
  ('00000000-0000-4000-8000-00000000e006', '00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000c001', 'P6', 'closed_won', null);
do $$
begin
  perform portal_claim_deal('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-00000000a002',
    '00000000-0000-4000-8000-00000000f002', -1, '{}', null);
exception when others then
  null;
end $$;
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e006'),
  null::uuid, 'a failed claim leaves the project unowned');
select pg_temp.assert_eq(
  (select count(*) from portal_assignments where deal_id = '00000000-0000-4000-8000-00000000d005'), 0::bigint,
  'a failed claim writes no record');
select pg_temp.assert_eq(
  (select count(*) from portal_assignments where deal_id = '00000000-0000-4000-8000-00000000d002'), 1::bigint,
  'the earlier successful claim on another deal is untouched');

-- 7. A manager's assignment replaces an owner, under the same locks, and records it.
select portal_record_assignment('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000a001',
  2, '{}', 'manual', '00000000-0000-4000-8000-00000000f001', 'Reassigned by a manager');
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e003'),
  '00000000-0000-4000-8000-00000000a001'::uuid, 'a manager assignment replaces the owner');
select pg_temp.assert_eq(
  (select count(*) from portal_assignments where deal_id = '00000000-0000-4000-8000-00000000d003'), 1::bigint,
  'a manager assignment writes its record once');

-- 8. A manager's assignment on a pre-project deal writes the record, not an owner.
select portal_record_assignment('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000a001',
  2, '{}', 'manual', '00000000-0000-4000-8000-00000000f001', 'Chosen by hand');
select pg_temp.assert_eq(
  (select team_member_id from portal_assignments where deal_id = '00000000-0000-4000-8000-00000000d004'
    order by created_at desc limit 1),
  '00000000-0000-4000-8000-00000000a001'::uuid, 'the newest record names the manager’s choice before a project exists');

-- 9. A new project inherits the owner its deal settled before it existed, and
--    never replaces an owner it already has.
insert into implementations (id, deal_id, customer_id, name, current_stage, owner_id) values
  ('00000000-0000-4000-8000-00000000e005', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001', 'P5', 'closed_won', null);
select portal_inherit_pre_project_owner('00000000-0000-4000-8000-00000000e005');
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e005'),
  '00000000-0000-4000-8000-00000000a001'::uuid, 'a new project inherits the pre-project owner');
update implementations set owner_id = '00000000-0000-4000-8000-00000000a002' where id = '00000000-0000-4000-8000-00000000e005';
select pg_temp.assert_eq(
  portal_inherit_pre_project_owner('00000000-0000-4000-8000-00000000e005'), false,
  'inheritance reports nothing set when the project already has an owner');
select pg_temp.assert_eq(
  (select owner_id from implementations where id = '00000000-0000-4000-8000-00000000e005'),
  '00000000-0000-4000-8000-00000000a002'::uuid, 'inheritance never replaces an owner the project already has');

-- 10. No duplicate authoritative records: a second claim on a deal already claimed is refused,
--     and the record count is unchanged.
select pg_temp.assert_refused(
  $q$select portal_claim_deal('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000f002', 2, '{}', null)$q$,
  'already_owned', 'a repeat claim on a claimed deal is refused');
select pg_temp.assert_eq(
  (select count(*) from portal_assignments where deal_id = '00000000-0000-4000-8000-00000000d001'), 1::bigint,
  'a refused repeat claim writes no second record');

rollback;
