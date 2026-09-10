-- Invariant probes for assignment (0050).
begin;
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

insert into team_members (id, name, email, role) values
  ('00000000-0000-4000-8000-00000000b001', 'Probe Person', 'probe@example.com', 'implementation');
insert into portal_accounts (id, name) values ('00000000-0000-4000-8000-00000000b002', 'Probe Deal');

-- Capacity must be a real share.
select pg_temp.assert_refused(
  $q$insert into portal_assignment_pool (team_member_id, capacity) values ('00000000-0000-4000-8000-00000000b001', 0)$q$,
  'portal_assignment_pool_capacity_check', 'a pool member with zero capacity');
insert into portal_assignment_pool (team_member_id) values ('00000000-0000-4000-8000-00000000b001');

-- A pick must say who decided, and weigh at least nothing.
select pg_temp.assert_refused(
  $q$insert into portal_assignments (deal_id, team_member_id, weight, source) values ('00000000-0000-4000-8000-00000000b002','00000000-0000-4000-8000-00000000b001', 1, 'guess')$q$,
  'portal_assignments_source_check', 'an assignment with an unknown source');
select pg_temp.assert_refused(
  $q$insert into portal_assignments (deal_id, team_member_id, weight, source) values ('00000000-0000-4000-8000-00000000b002','00000000-0000-4000-8000-00000000b001', -1, 'auto')$q$,
  'portal_assignments_weight_check', 'a negative weight');
insert into portal_assignments (deal_id, team_member_id, weight, source, breakdown)
  values ('00000000-0000-4000-8000-00000000b002','00000000-0000-4000-8000-00000000b001', 3, 'auto', '{"base":1,"integration":2}');
rollback;
