-- 0061: the stage names the team uses.
--
-- The deal's stages are now a checklist (src/lib/stage-flow.ts): Closed Won
-- until the welcome brief is generated, then Pre-kickoff until the kickoff
-- call is booked, then Onboarding. The enum keys stay; only the labels the
-- board and the deal show change. A label an operator already renamed by
-- hand is left alone.

update public.portal_pipeline_stages
   set label = 'Pre-kickoff'
 where key = 'onboarding_kickoff'
   and label = 'Onboarding Kickoff';

update public.portal_pipeline_stages
   set label = 'Onboarding'
 where key = 'in_onboarding'
   and label = 'In Onboarding';
