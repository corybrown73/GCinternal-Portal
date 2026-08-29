-- Down for 0016_seed_more_templates.sql
--
-- Removes the three seeded templates. Refuses if any implementation was
-- instantiated from one, since that would be live plan data.
do $$
declare
  used int;
begin
  select count(*) into used from journey_instantiations ji
    join journey_templates t on t.id = ji.template_id
   where t.key in ('add-on', 'integration', 'data-migration');
  if used > 0 then
    raise exception '% implementation(s) use these templates: roll back 0014 first', used;
  end if;
end $$;

-- Published content is frozen by trigger, so unpublish before deleting.
update journey_templates set status = 'draft', superseded_by_id = null, supersedes_id = null
 where key in ('add-on', 'integration', 'data-migration');
delete from journey_template_tasks where template_id in (
  select id from journey_templates where key in ('add-on', 'integration', 'data-migration'));
delete from scoping_questions where template_id in (
  select id from journey_templates where key in ('add-on', 'integration', 'data-migration'));
delete from journey_template_stages where template_id in (
  select id from journey_templates where key in ('add-on', 'integration', 'data-migration'));
delete from journey_templates where key in ('add-on', 'integration', 'data-migration');
