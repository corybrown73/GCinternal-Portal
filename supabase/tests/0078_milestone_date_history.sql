-- Probe for 0078: a blank reason is refused (by the function, and by the
-- table itself), the override and the history land together, a second
-- explicit change never rewrites the baseline or an earlier row, and a
-- cascade row is only ever accepted linked back to the direct change that
-- caused it. Seeds its own account inside a transaction it rolls back.
begin;
insert into public.portal_accounts (id, name, stage)
values ('00000000-0000-4000-8000-000000000078', 'probe 0078', 'onboarding_kickoff');

do $$
declare
  v_id1 uuid;
  v_id2 uuid;
  v_n int;
  v_baseline date;
begin
  -- A blank reason is refused before anything is written.
  begin
    perform public.portal_record_milestone_date_change(
      '00000000-0000-4000-8000-000000000078', 'kickoff',
      '2026-09-11', '2026-09-15', '   ', null, false
    );
    raise exception '0078: INVARIANT NOT ENFORCED - a blank reason was accepted';
  exception when others then
    if sqlerrm not like '%reason%' then raise; end if;
  end;
  if exists (select 1 from public.portal_milestone_date_changes
              where account_id = '00000000-0000-4000-8000-000000000078') then
    raise exception '0078: a refused call still wrote a history row';
  end if;

  -- The first explicit change: the override and the history land together.
  v_id1 := public.portal_record_milestone_date_change(
    '00000000-0000-4000-8000-000000000078', 'kickoff',
    '2026-09-11', '2026-09-15', 'customer asked to push it a week', null, true
  );
  if (select intake -> 'timeline' -> 'overrides' ->> 'kickoff'
        from public.portal_accounts where id = '00000000-0000-4000-8000-000000000078')
     <> '2026-09-15' then
    raise exception '0078: the override was not written with the history';
  end if;
  select baseline_date into v_baseline from public.portal_milestone_date_baselines
   where account_id = '00000000-0000-4000-8000-000000000078' and milestone_key = 'kickoff';
  if v_baseline <> '2026-09-11' then
    raise exception '0078: the baseline did not capture the first previous date';
  end if;
  if (select was_overdue_at_change from public.portal_milestone_date_changes where id = v_id1)
     is distinct from true then
    raise exception '0078: overdue-at-change was not preserved on the direct row';
  end if;

  -- A second explicit change never rewrites the baseline, and both rows
  -- survive — append-only, not a replace.
  v_id2 := public.portal_record_milestone_date_change(
    '00000000-0000-4000-8000-000000000078', 'kickoff',
    '2026-09-15', '2026-09-22', 'pushed again, new go-live target', null, false
  );
  select baseline_date into v_baseline from public.portal_milestone_date_baselines
   where account_id = '00000000-0000-4000-8000-000000000078' and milestone_key = 'kickoff';
  if v_baseline <> '2026-09-11' then
    raise exception '0078: a later change rewrote the baseline';
  end if;
  select count(*) into v_n from public.portal_milestone_date_changes
   where account_id = '00000000-0000-4000-8000-000000000078' and milestone_key = 'kickoff';
  if v_n <> 2 then raise exception '0078: expected 2 history rows, found %', v_n; end if;
  if v_id1 = v_id2 then raise exception '0078: the second change reused the first row'; end if;

  -- A cascade row is accepted only linked back to a direct change.
  begin
    insert into public.portal_milestone_date_changes
      (account_id, milestone_key, change_kind, previous_date, new_date, reason)
    values
      ('00000000-0000-4000-8000-000000000078', 'working', 'cascade', '2026-09-20', '2026-09-27', null);
    raise exception '0078: INVARIANT NOT ENFORCED - a cascade with no caused_by was accepted';
  exception when check_violation then null;
  end;

  -- A direct row with a blank reason is refused at the table, not only by
  -- the function wrapping it.
  begin
    insert into public.portal_milestone_date_changes
      (account_id, milestone_key, change_kind, previous_date, new_date, reason)
    values
      ('00000000-0000-4000-8000-000000000078', 'working', 'direct', '2026-09-20', '2026-09-27', '');
    raise exception '0078: INVARIANT NOT ENFORCED - a direct row with a blank reason was accepted';
  exception when check_violation then null;
  end;

  -- A cascade passed through the function lands linked to the direct change.
  v_id1 := public.portal_record_milestone_date_change(
    '00000000-0000-4000-8000-000000000078', 'working',
    '2026-09-20', '2026-09-27', 'moved with kickoff', null, false,
    jsonb_build_array(jsonb_build_object(
      'milestoneKey', 'fieldtest', 'previousDate', '2026-09-21', 'newDate', '2026-09-28',
      'wasOverdue', false
    ))
  );
  if not exists (
    select 1 from public.portal_milestone_date_changes
     where account_id = '00000000-0000-4000-8000-000000000078'
       and milestone_key = 'fieldtest' and change_kind = 'cascade'
       and caused_by_change_id = v_id1 and reason is null
  ) then
    raise exception '0078: the cascade row was not recorded linked to its direct change';
  end if;

  raise notice 'probe 0078 ok';
end $$;
rollback;
