-- Reverses 0059: Field Fusion training v2 goes, v1 is current again.
--
-- ORDER MATTERS. `journey_templates_current_idx` is unique on (org_id, key)
-- where status = 'published' and superseded_by_id is null. Un-superseding v1
-- while v2 is still published puts two rows in that state and the statement
-- fails — which is how this file broke the down → up cycle. So v2 steps out
-- of the index first (draft), then v1 comes back, then v2 is removed.
update journey_templates set status = 'draft' where key = 'field-fusion' and version = 2;
update journey_templates set superseded_by_id = null where key = 'field-fusion' and version = 1;
delete from journey_template_tasks  where template_id in (select id from journey_templates where key = 'field-fusion' and version = 2);
delete from journey_template_stages where template_id in (select id from journey_templates where key = 'field-fusion' and version = 2);
delete from journey_templates where key = 'field-fusion' and version = 2;
