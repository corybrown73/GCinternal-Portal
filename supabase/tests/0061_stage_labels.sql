-- Probe for 0061: the two stages carry the team's names.
--
-- 0072 later recased Pre-kickoff to Pre-Kickoff and retired the in_onboarding
-- row in favour of the three middle stages, and 0076 renamed the stage
-- Intake & Process, so this probe checks what 0061 itself guarantees: the
-- stage is labelled as the team names it (any of those), and the Onboarding
-- row, while it still exists, is labelled Onboarding and not the old "In
-- Onboarding".
do $$
begin
  if not exists (
    select 1 from public.portal_pipeline_stages
     where key = 'onboarding_kickoff' and label in ('Pre-kickoff', 'Pre-Kickoff', 'Intake & Process')
  ) then
    raise exception '0061: onboarding_kickoff is not labelled Pre-kickoff';
  end if;
  if exists (
    select 1 from public.portal_pipeline_stages
     where key = 'in_onboarding' and label <> 'Onboarding'
  ) then
    raise exception '0061: in_onboarding is not labelled Onboarding';
  end if;
end $$;
