-- Reverses 0076: the labels 0072 left, where 0076 set them.
update portal_pipeline_stages set label = 'Pre-Kickoff'
 where key = 'onboarding_kickoff' and label = 'Intake & Process';
update portal_pipeline_stages set label = 'Implementation Complete'
 where key = 'onboarding_complete' and label = 'Graduate';
