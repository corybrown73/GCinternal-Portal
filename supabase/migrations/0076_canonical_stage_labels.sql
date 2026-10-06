-- 0076: the configured pipeline uses the operating model's names for the
-- first and last stages after the close — Intake & Process and Graduate —
-- so the board, the Customer 360 header, Home and the stepper all say the
-- same thing. The keys do not change; only the labels the board reads.
-- A label an operator renamed by hand is left alone.
update portal_pipeline_stages set label = 'Intake & Process'
 where key = 'onboarding_kickoff' and label in ('Pre-Kickoff', 'Pre-kickoff', 'Onboarding Kickoff');
update portal_pipeline_stages set label = 'Graduate'
 where key = 'onboarding_complete' and label in ('Implementation Complete', 'Onboarding Complete');
