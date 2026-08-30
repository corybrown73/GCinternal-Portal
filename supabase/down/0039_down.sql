-- Down for 0039_realign_stage_labels.sql
--
-- Restores the labels 0031 seeded. Doing so re-creates the disagreement between
-- the configured names and the compiled-in ones — which is the state this
-- migration exists to end, and is therefore what rolling it back means.
--
-- As on the way up, only rows still carrying the value 0039 wrote are touched.
-- Somebody who has since renamed a stage keeps their name.

update portal_lifecycle_stages set label = 'Plan (internal)'
 where key = 'plan-internal' and label = 'Plan Internally';

update portal_lifecycle_stages set label = 'Align (external)'
 where key = 'align-external' and label = 'Align Externally';

update portal_lifecycle_stages set label = 'Validate and iterate'
 where key = 'validate-iterate' and label = 'Validate / Iterate';

update portal_lifecycle_stages set label = 'Graduate to CS'
 where key = 'graduate-to-cs' and label = 'Handover to Customer Success';

update portal_lifecycle_stages
   set intent = 'The internal plan is agreed before anything is put in front of the customer.'
 where key = 'plan-internal'
   and intent = 'Internal implementation plan, owners and target dates committed.';

update portal_lifecycle_stages
   set intent = 'The customer has agreed the plan, the dates and who owns what.'
 where key = 'align-external'
   and intent = 'Customer stakeholders, success criteria and decision rights confirmed.';
