-- Probe for 0073: the columns exist, the tiers are seeded, a bad reason code
-- and a bad note kind are refused, a good one lands. Seeds its own customer
-- and implementation inside a transaction it rolls back.
begin;
do $$
declare v_n int;
begin
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'implementations'
     and column_name in ('tier_expected_date','baseline_date','baseline_locked_at',
                         'target_date','go_live_at','complete_outcome','complete_reason');
  if v_n <> 7 then raise exception '0073: expected 7 new implementation columns, found %', v_n; end if;
  select jsonb_array_length(value->'tiers') into v_n from public.portal_app_config where key = 'complexity_tiers';
  if coalesce(v_n, 0) < 2 then raise exception '0073: complexity_tiers not seeded'; end if;
  raise notice 'probe 0073 schema ok';
end $$;

insert into public.customers (id, name)
values ('00000000-0000-4000-8000-000000000073', 'probe 0073');
insert into public.implementations (id, customer_id, name, current_stage)
values ('00000000-0000-4000-8000-000000000173', '00000000-0000-4000-8000-000000000073', 'probe 0073', 'build');

do $$
begin
  begin
    insert into public.target_date_changes (implementation_id, from_date, to_date, reason_code)
    values ('00000000-0000-4000-8000-000000000173', '2026-10-01', '2026-10-08', 'because');
    raise exception '0073: INVARIANT NOT ENFORCED - a made-up reason code was accepted';
  exception when check_violation then null;
  end;
  insert into public.target_date_changes (implementation_id, from_date, to_date, reason_code)
  values ('00000000-0000-4000-8000-000000000173', '2026-10-01', '2026-10-08', null);
  insert into public.target_date_changes (implementation_id, from_date, to_date, reason_code)
  values ('00000000-0000-4000-8000-000000000173', '2026-10-08', '2026-10-15', 'customer');

  begin
    insert into public.journal_entries (implementation_id, stage, note, kind)
    values ('00000000-0000-4000-8000-000000000173', 'build', 'x', 'rant');
    raise exception '0073: INVARIANT NOT ENFORCED - a made-up note kind was accepted';
  exception when check_violation then null;
  end;
  insert into public.journal_entries (implementation_id, stage, note, kind)
  values ('00000000-0000-4000-8000-000000000173', 'build', 'customer silent 5 bd', 'customer');
  insert into public.journal_entries (implementation_id, stage, note)
  values ('00000000-0000-4000-8000-000000000173', 'build', 'plain note');
  if (select kind from public.journal_entries where note = 'plain note'
        and implementation_id = '00000000-0000-4000-8000-000000000173') <> 'note' then
    raise exception '0073: a plain note did not default to kind=note';
  end if;

  begin
    update public.implementations set complete_outcome = 'maybe'
     where id = '00000000-0000-4000-8000-000000000173';
    raise exception '0073: INVARIANT NOT ENFORCED - outcome "maybe" was accepted';
  exception when check_violation then null;
  end;
  raise notice 'probe 0073 constraints ok';
end $$;
rollback;
