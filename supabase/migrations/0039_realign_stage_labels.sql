-- 0039 — make the configured stage labels match the ones on screen
--
-- 0031 said it seeded `portal_lifecycle_stages` with "exactly what
-- LIFECYCLE_STAGES contains, so both paths render identically until somebody
-- edits something". It did not. The seed rewrote the labels and the intents:
--
--   compiled            seeded
--   Plan Internally     Plan (internal)
--   Align Externally    Align (external)
--   Validate / Iterate  Validate and iterate
--   Handover to CS      Graduate to CS
--
-- Nobody noticed because nothing read the config — that is the other half of
-- this bug. Now that the registry does read it, applying the fix without this
-- migration would silently rename four stages across the whole product on the
-- next deploy: every filter chip, every badge, every rail, every report. A
-- rename nobody asked for is a worse bug than the one being fixed.
--
-- So the config is realigned to what people currently read. Editing a stage
-- still changes it everywhere; that is the point. This only settles where the
-- two disagreed through nobody's decision.
--
-- ONLY UNTOUCHED ROWS. A row whose label no longer equals the 0031 seed value
-- was renamed by a person, and their rename wins over this correction — it is
-- the more recent decision and the one somebody meant.

update portal_lifecycle_stages set label = 'Plan Internally'
 where key = 'plan-internal' and label = 'Plan (internal)';

update portal_lifecycle_stages set label = 'Align Externally'
 where key = 'align-external' and label = 'Align (external)';

update portal_lifecycle_stages set label = 'Validate / Iterate'
 where key = 'validate-iterate' and label = 'Validate and iterate';

update portal_lifecycle_stages set label = 'Handover to Customer Success'
 where key = 'graduate-to-cs' and label = 'Graduate to CS';

-- The intents disagreed too, and they are the descriptions the admin screen
-- shows beneath each stage. Same rule: only where still at the seeded text.
update portal_lifecycle_stages
   set intent = 'Internal implementation plan, owners and target dates committed.'
 where key = 'plan-internal'
   and intent = 'The internal plan is agreed before anything is put in front of the customer.';

update portal_lifecycle_stages
   set intent = 'Customer stakeholders, success criteria and decision rights confirmed.'
 where key = 'align-external'
   and intent = 'The customer has agreed the plan, the dates and who owns what.';
