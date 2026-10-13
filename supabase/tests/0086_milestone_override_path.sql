-- Probe for 0086: the moved date lands whatever shape the deal's intake has —
-- no intake, a timeline with no overrides, or overrides that already hold
-- other keys (kept). Seeds its own accounts inside a transaction it rolls back.
begin;
insert into public.portal_accounts (id, name, stage, intake) values
  ('00000000-0000-4000-8000-000000000861', 'probe 0086 empty', 'onboarding_kickoff', '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000862', 'probe 0086 no overrides', 'onboarding_kickoff',
   '{"timeline": {"timezone": "America/Chicago"}}'::jsonb),
  ('00000000-0000-4000-8000-000000000863', 'probe 0086 has overrides', 'onboarding_kickoff',
   '{"timeline": {"overrides": {"working": "2026-12-01"}}}'::jsonb);

do $$
declare v_intake jsonb;
begin
  perform public.portal_record_milestone_date_change(
    '00000000-0000-4000-8000-000000000861', 'kickoff', '2026-11-02', '2026-11-09', 'probe', null, false);
  select intake into v_intake from public.portal_accounts where id = '00000000-0000-4000-8000-000000000861';
  if v_intake #>> '{timeline,overrides,kickoff}' is distinct from '2026-11-09' then
    raise exception 'probe 0086: the date did not land on an empty intake: %', v_intake;
  end if;

  perform public.portal_record_milestone_date_change(
    '00000000-0000-4000-8000-000000000862', 'kickoff', '2026-11-02', '2026-11-09', 'probe', null, false);
  select intake into v_intake from public.portal_accounts where id = '00000000-0000-4000-8000-000000000862';
  if v_intake #>> '{timeline,overrides,kickoff}' is distinct from '2026-11-09'
     or v_intake #>> '{timeline,timezone}' is distinct from 'America/Chicago' then
    raise exception 'probe 0086: a timeline with no overrides lost the date or its timezone: %', v_intake;
  end if;

  perform public.portal_record_milestone_date_change(
    '00000000-0000-4000-8000-000000000863', 'kickoff', '2026-11-02', '2026-11-09', 'probe', null, false);
  select intake into v_intake from public.portal_accounts where id = '00000000-0000-4000-8000-000000000863';
  if v_intake #>> '{timeline,overrides,kickoff}' is distinct from '2026-11-09'
     or v_intake #>> '{timeline,overrides,working}' is distinct from '2026-12-01' then
    raise exception 'probe 0086: existing overrides were not kept: %', v_intake;
  end if;

  raise notice 'probe 0086 ok';
end $$;
rollback;
