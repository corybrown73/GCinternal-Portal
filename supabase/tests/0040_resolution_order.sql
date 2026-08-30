-- Invariant probes for resolution dates (0040).
--
-- The failure this guards is quiet by design: a risk resolved before it was
-- identified looks like an ordinary row. Time-to-resolve comes out negative,
-- the row still counts as closed, and nothing on any screen objects. So each
-- probe asserts both that the write is refused AND that it is refused for the
-- right reason — a probe that passes because the fixture was malformed is
-- worse than no probe.
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

-- A customer and an implementation to hang the probes off.
insert into customers (id, name)
values ('40000000-0000-4000-8000-000000000001', 'Resolution Order Probe Co');

insert into implementations (id, customer_id, name, current_stage)
values ('40000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000001',
        'Resolution order probe', 'build');

-- ---------------------------------------------------------------------------
-- Backwards is refused, on insert
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused(
  $q$insert into risks (implementation_id, title, identified_at, resolved_at)
     values ('40000000-0000-4000-8000-000000000002', 'Backwards on insert',
             '2026-08-12T09:00:00Z', '2026-08-03T00:00:00Z')$q$,
  'cannot be resolved on 2026-08-03',
  'a risk resolved nine days before it was identified');

-- ...and on update, which is the path a person actually takes: the row is
-- created open and the date is typed in later.
insert into risks (id, implementation_id, title, identified_at)
values ('40000000-0000-4000-8000-000000000003',
        '40000000-0000-4000-8000-000000000002',
        'Backwards on update', '2026-08-12T09:00:00Z');

select pg_temp.assert_refused(
  $q$update risks set resolved_at = '2026-08-03T00:00:00Z'
      where id = '40000000-0000-4000-8000-000000000003'$q$,
  'cannot be resolved on 2026-08-03',
  'a risk edited to resolve before it was identified');

-- Moving the START date backwards past an existing resolution is the same
-- contradiction approached from the other side, and must be refused too.
insert into risks (id, implementation_id, title, identified_at, resolved_at)
values ('40000000-0000-4000-8000-000000000004',
        '40000000-0000-4000-8000-000000000002',
        'Start moved forward', '2026-08-01T09:00:00Z', '2026-08-05T00:00:00Z');

select pg_temp.assert_refused(
  $q$update risks set identified_at = '2026-08-20T09:00:00Z'
      where id = '40000000-0000-4000-8000-000000000004'$q$,
  'cannot be resolved on 2026-08-05',
  'a risk whose identification date is moved past its resolution');

-- ---------------------------------------------------------------------------
-- The same-day case, which a naive instant comparison gets wrong
-- ---------------------------------------------------------------------------
-- "Resolved on" is a date, stored at UTC midnight. A risk identified at 14:00
-- and closed that same afternoon therefore has a resolution INSTANT six hours
-- earlier than its own identification. Refusing it would block the commonest
-- legitimate entry there is, so the comparison is in calendar days.
do $$
begin
  insert into risks (implementation_id, title, identified_at, resolved_at)
  values ('40000000-0000-4000-8000-000000000002', 'Same day',
          '2026-08-12T14:00:00Z', '2026-08-12T00:00:00Z');
  raise notice 'ok — a risk identified at 14:00 can be resolved that same day';
end $$;

-- ---------------------------------------------------------------------------
-- Issues and escalations, which use raised_at rather than identified_at
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused(
  $q$insert into issues (implementation_id, title, raised_at, resolved_at)
     values ('40000000-0000-4000-8000-000000000002', 'Backwards issue',
             '2026-08-12T09:00:00Z', '2026-08-01T00:00:00Z')$q$,
  'cannot be resolved on 2026-08-01',
  'an issue resolved before it was raised');

select pg_temp.assert_refused(
  $q$insert into escalations (implementation_id, title, raised_at, resolved_at)
     values ('40000000-0000-4000-8000-000000000002', 'Backwards escalation',
             '2026-08-12T09:00:00Z', '2026-08-01T00:00:00Z')$q$,
  'cannot be resolved on 2026-08-01',
  'an escalation resolved before it was raised');

-- ---------------------------------------------------------------------------
-- An unresolved row is still ordinary
-- ---------------------------------------------------------------------------
-- Most rows have no resolution date at all, and the guard must be invisible to
-- them — a trigger that makes the common path fail is a worse bug than the one
-- it fixes.
do $$
begin
  insert into risks (implementation_id, title, identified_at)
  values ('40000000-0000-4000-8000-000000000002', 'Still open', '2026-08-12T09:00:00Z');
  raise notice 'ok — an open risk is unaffected';
end $$;

rollback;
