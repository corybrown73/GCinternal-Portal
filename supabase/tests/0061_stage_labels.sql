-- Probe for 0061: the two stages carry the team's names.
do $$
begin
  if not exists (
    select 1 from public.portal_pipeline_stages
     where key = 'onboarding_kickoff' and label = 'Pre-kickoff'
  ) then
    raise exception '0061: onboarding_kickoff is not labelled Pre-kickoff';
  end if;
  if not exists (
    select 1 from public.portal_pipeline_stages
     where key = 'in_onboarding' and label = 'Onboarding'
  ) then
    raise exception '0061: in_onboarding is not labelled Onboarding';
  end if;
end $$;
