-- Reverses 0061: the old stage labels, where 0061 set them.
update public.portal_pipeline_stages
   set label = 'Onboarding Kickoff'
 where key = 'onboarding_kickoff'
   and label = 'Pre-kickoff';

update public.portal_pipeline_stages
   set label = 'In Onboarding'
 where key = 'in_onboarding'
   and label = 'Onboarding';
