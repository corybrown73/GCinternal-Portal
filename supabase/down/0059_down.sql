update journey_templates set superseded_by_id = null where key = 'field-fusion' and version = 1;
update journey_templates set status = 'draft' where key = 'field-fusion' and version = 2;
delete from journey_template_tasks  where template_id in (select id from journey_templates where key = 'field-fusion' and version = 2);
delete from journey_template_stages where template_id in (select id from journey_templates where key = 'field-fusion' and version = 2);
delete from journey_templates where key = 'field-fusion' and version = 2;
