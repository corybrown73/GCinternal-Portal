-- Probe for 0076: the first and last post-close stages carry the operating
-- model's names, and nothing else about the pipeline moved.
do $$
declare v_term text;
begin
  if not exists (
    select 1 from public.portal_pipeline_stages
     where key = 'onboarding_kickoff' and label = 'Intake & Process'
  ) then
    raise exception '0076: onboarding_kickoff is not labelled Intake & Process';
  end if;
  if not exists (
    select 1 from public.portal_pipeline_stages
     where key = 'onboarding_complete' and label = 'Graduate'
  ) then
    raise exception '0076: onboarding_complete is not labelled Graduate';
  end if;
  select key into v_term from public.portal_pipeline_stages where is_terminal;
  if v_term <> 'onboarding_complete' then raise exception '0076: the final stage is %', v_term; end if;
  raise notice 'probe 0076 ok';
end $$;
