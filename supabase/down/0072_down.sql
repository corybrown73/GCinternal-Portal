-- Reverses 0072 as far as data allows: the three stages' deals go back to
-- in_onboarding (a system transition each), the three rows go, the labels
-- return. The journey rows 0072 wrote are marked and left (the app keeps the
-- journey inside the deal's band from here on).
insert into portal_pipeline_stages (key, label, color, sort_order, is_won, is_terminal)
select 'in_onboarding', 'Onboarding', 'primary',
       (select coalesce(max(sort_order), 0) + 1 from portal_pipeline_stages), false, false
 where not exists (select 1 from portal_pipeline_stages where key = 'in_onboarding');
do $$
declare r record;
begin
  perform set_config('app.allow_stage_change', 'on', true);
  for r in select id, stage from portal_accounts where stage in ('get_it_working','make_it_yours','make_it_run') loop
    update portal_accounts set stage = 'in_onboarding' where id = r.id;
    insert into portal_stage_transitions (account_id, from_stage, to_stage, source, note, occurred_at)
    values (r.id, r.stage, 'in_onboarding', 'system', 'Reversed 0072', now());
  end loop;
  perform set_config('app.allow_stage_change', '', true);
end $$;
delete from portal_pipeline_stages where key in ('get_it_working','make_it_yours','make_it_run');
update portal_pipeline_stages set label = 'Pre-kickoff' where key = 'onboarding_kickoff' and label = 'Pre-Kickoff';
update portal_pipeline_stages set label = 'Onboarding Complete' where key = 'onboarding_complete' and label = 'Implementation Complete';
do $$
declare v_keys text[];
begin
  select array_agg(key order by case key when 'in_onboarding' then (select sort_order + 0.5 from portal_pipeline_stages where key = 'onboarding_kickoff') else sort_order::numeric end)
    into v_keys from portal_pipeline_stages;
  perform portal_set_pipeline_stage_order(v_keys);
end $$;
