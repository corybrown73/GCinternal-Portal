-- Invariant probes for customer meeting notes (0087) and presenter-only note
-- selections (0088).
--
-- Three things have to hold. A customer meeting is a note, not an exception,
-- and an unknown kind is still refused. A selection can only point at a plain
-- note or customer meeting on the same deal's implementation, in the same
-- organisation, and never at an exception record. And deleting a selection's
-- parent removes only the selection: the note, the implementation and the deal
-- survive a pick being removed, and a deleted note takes its picks with it.
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
  raise exception 'INVARIANT "%" was accepted but must be refused', p_what;
end;
$fn$;

create function pg_temp.assert_count(p_sql text, p_expected bigint, p_what text)
returns void language plpgsql as $fn$
declare
  n bigint;
begin
  execute p_sql into n;
  if n <> p_expected then
    raise exception 'INVARIANT "%" expected %, got %', p_what, p_expected, n;
  end if;
  raise notice 'ok — %', p_what;
end;
$fn$;

-- Fixtures: one organisation with two deals, a person, and a customer meeting
-- and notes on the first deal's implementation.
insert into orgs (id, name) values ('00000000-0000-4000-8000-0000000000b2', 'Other org');

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-0000000000a1', 'probe-presenter@gocanvas.com')
on conflict (id) do nothing;

insert into portal_profiles (id, email)
values ('00000000-0000-4000-8000-0000000000a1', 'probe-presenter@gocanvas.com')
on conflict (id) do nothing;

insert into customers (id, name) values ('00000000-0000-4000-8000-0000000000c1', 'Probe customer');

insert into portal_accounts (id, name) values
  ('00000000-0000-4000-8000-0000000000d1', 'Probe deal A'),
  ('00000000-0000-4000-8000-0000000000d2', 'Probe deal B');

insert into implementations (id, customer_id, name, current_stage, deal_id) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'Probe impl A', 'build', '00000000-0000-4000-8000-0000000000d1'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', 'Probe impl B', 'build', '00000000-0000-4000-8000-0000000000d2');

insert into journal_entries (id, implementation_id, stage, note, kind, meeting_date, participants) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 'build', 'Plain note', 'note', null, null),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1', 'build', 'Scope exception', 'scope', null, null),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e1', 'build', 'Customer meeting', 'customer_meeting', '2026-10-15', 'Dana Sample'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000e2', 'build', 'Note on deal B', 'note', null, null);

-- The kind check: the new kind is accepted, an unknown one is not.
select pg_temp.assert_refused(
  $q$ insert into journal_entries (implementation_id, stage, note, kind)
      values ('00000000-0000-4000-8000-0000000000e1', 'build', 'x', 'rant') $q$,
  'journal_entries_kind_check', 'an unknown journal kind is refused');

-- Selections: the happy path, then each refusal.
insert into presenter_note_picks (org_id, profile_id, deal_id, journal_entry_id)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f1');
select pg_temp.assert_count(
  $q$ select count(*) from presenter_note_picks $q$, 1, 'a plain note on the same deal can be selected');

select pg_temp.assert_refused(
  $q$ insert into presenter_note_picks (org_id, profile_id, deal_id, journal_entry_id)
      values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
              '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f2') $q$,
  'exception records cannot be selected', 'an exception record cannot be selected');

select pg_temp.assert_refused(
  $q$ insert into presenter_note_picks (org_id, profile_id, deal_id, journal_entry_id)
      values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
              '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f4') $q$,
  'not on this deal', 'a note from another deal cannot be selected');

select pg_temp.assert_refused(
  $q$ insert into presenter_note_picks (org_id, profile_id, deal_id, journal_entry_id)
      values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
              '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f1') $q$,
  'presenter_note_picks_one_per_person', 'the same note cannot be selected twice by one person');

select pg_temp.assert_refused(
  $q$ insert into presenter_note_picks (org_id, profile_id, deal_id, journal_entry_id)
      values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1',
              '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f3') $q$,
  'organisation mismatch', 'a selection cannot cross organisations');

-- A customer meeting is selectable like a note.
insert into presenter_note_picks (org_id, profile_id, deal_id, journal_entry_id)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f3');

-- Removing a selection leaves the note in place.
delete from presenter_note_picks where journal_entry_id = '00000000-0000-4000-8000-0000000000f1';
select pg_temp.assert_count(
  $q$ select count(*) from journal_entries where id = '00000000-0000-4000-8000-0000000000f1' $q$,
  1, 'removing a selection keeps the source note');

-- Deleting the source note removes its selection and nothing else.
insert into presenter_note_picks (org_id, profile_id, deal_id, journal_entry_id)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000f1');
delete from journal_entries where id = '00000000-0000-4000-8000-0000000000f1';
select pg_temp.assert_count(
  $q$ select count(*) from presenter_note_picks where journal_entry_id = '00000000-0000-4000-8000-0000000000f1' $q$,
  0, 'deleting a source note removes its selection');
select pg_temp.assert_count(
  $q$ select count(*) from implementations where id = '00000000-0000-4000-8000-0000000000e1' $q$,
  1, 'deleting a source note leaves the implementation in place');

-- Deleting the deal removes its selections; the implementation survives, detached
-- from the deal as it always is (0041), and the customer meeting stays.
delete from portal_accounts where id = '00000000-0000-4000-8000-0000000000d1';
select pg_temp.assert_count(
  $q$ select count(*) from presenter_note_picks where deal_id = '00000000-0000-4000-8000-0000000000d1' $q$,
  0, 'deleting a deal removes its selections');
select pg_temp.assert_count(
  $q$ select count(*) from journal_entries where id = '00000000-0000-4000-8000-0000000000f3' $q$,
  1, 'deleting a deal keeps its customer meeting');

-- Deleting the person removes that person's selections.
insert into portal_accounts (id, name) values ('00000000-0000-4000-8000-0000000000d3', 'Probe deal C');
insert into implementations (id, customer_id, name, current_stage, deal_id) values
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c1', 'Probe impl C', 'build', '00000000-0000-4000-8000-0000000000d3');
insert into journal_entries (id, implementation_id, stage, note, kind) values
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000e3', 'build', 'Deal C note', 'note');
insert into presenter_note_picks (org_id, profile_id, deal_id, journal_entry_id)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000f5');
delete from portal_profiles where id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.assert_count(
  $q$ select count(*) from presenter_note_picks where profile_id = '00000000-0000-4000-8000-0000000000a1' $q$,
  0, 'deleting a person removes their selections');

-- Nothing outside the service role can read or write the table.
select pg_temp.assert_count(
  $q$ select (case when has_table_privilege('anon', 'public.presenter_note_picks', 'select')
                     or has_table_privilege('authenticated', 'public.presenter_note_picks', 'select')
                     or has_table_privilege('anon', 'public.presenter_note_picks', 'insert')
                     or has_table_privilege('authenticated', 'public.presenter_note_picks', 'insert')
                then 1 else 0 end)::bigint $q$,
  0, 'anon and authenticated have no access to selections');

rollback;
