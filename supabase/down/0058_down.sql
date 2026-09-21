-- Removes the seeded template only while nothing was built from it; an
-- implementation that applied it keeps its stage instances and work items,
-- which do not reference the template rows.
delete from journey_template_tasks  where template_id in (select id from journey_templates where key = 'field-fusion' and version = 1);
delete from journey_template_stages where template_id in (select id from journey_templates where key = 'field-fusion' and version = 1);
delete from journey_templates where key = 'field-fusion' and version = 1;
