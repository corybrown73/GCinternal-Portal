-- Probe for 0072: no deal is left in the retired stage; the three new rows
-- sit right after Pre-Kickoff, in order; Implementation Complete is still the
-- final stage; a Get it working deal cannot be dragged to Make it run by a
-- person without the steps before it (the app's gate; the database keeps the
-- Closed Won one).
do $$
declare v_left int; v_pk int; v_a int; v_b int; v_c int; v_term text;
begin
  select count(*) into v_left from public.portal_accounts where stage = 'in_onboarding';
  if v_left > 0 then raise exception '0072: % account(s) still in in_onboarding', v_left; end if;
  select sort_order into v_pk from public.portal_pipeline_stages where key = 'onboarding_kickoff';
  select sort_order into v_a from public.portal_pipeline_stages where key = 'get_it_working';
  select sort_order into v_b from public.portal_pipeline_stages where key = 'make_it_yours';
  select sort_order into v_c from public.portal_pipeline_stages where key = 'make_it_run';
  if v_a is null or v_b is null or v_c is null then raise exception '0072: a stage row is missing'; end if;
  if not (v_a = v_pk + 1 and v_b = v_a + 1 and v_c = v_b + 1) then
    raise exception '0072: the three stages are not in order after Pre-Kickoff (% % % %)', v_pk, v_a, v_b, v_c;
  end if;
  if exists (select 1 from public.portal_pipeline_stages where key = 'in_onboarding') then
    raise exception '0072: the retired row is still configured';
  end if;
  select key into v_term from public.portal_pipeline_stages where is_terminal;
  if v_term <> 'onboarding_complete' then raise exception '0072: the final stage is %', v_term; end if;
  raise notice 'probe 0072 ok';
end $$;
