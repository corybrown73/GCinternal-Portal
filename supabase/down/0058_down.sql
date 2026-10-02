-- Removes the seeded template only while nothing was built from it; an
-- implementation that applied it keeps its stage instances and work items,
-- which do not reference the template rows.
--
-- A published template's stages and tasks are frozen by trigger
-- (journey_template_frozen, 0013), so v1 steps back to draft before its
-- content is removed. By this point 0059's down has already removed v2, so
-- nothing else holds the key.
update journey_templates set status = 'draft' where key = 'field-fusion' and version = 1;
delete from journey_template_tasks  where template_id in (select id from journey_templates where key = 'field-fusion' and version = 1);
delete from journey_template_stages where template_id in (select id from journey_templates where key = 'field-fusion' and version = 1);
delete from journey_templates where key = 'field-fusion' and version = 1;
