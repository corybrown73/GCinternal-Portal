-- Down for 0013_journey_templates.sql
--
-- Total rollback: every object below was created by 0013, and no pre-existing
-- table was altered. Template content authored between up and down IS lost —
-- export it first if any exists:
--   \copy (select * from journey_templates) to 'journey_templates.csv' csv header
--   (and the same for stages, tasks, questions, blocks, roles)
--
-- 0014's instance tables reference journey_templates, so 0014 must be rolled
-- back before this runs. The drops below will fail loudly if it has not been,
-- rather than cascading away live plan data.

drop trigger if exists scoping_questions_frozen on scoping_questions;
drop trigger if exists journey_template_tasks_frozen on journey_template_tasks;
drop trigger if exists journey_template_stages_frozen on journey_template_stages;
drop function if exists journey_template_frozen();

drop function if exists reorder_template_positions(text, uuid, uuid[]);
drop function if exists publish_template(uuid, text, uuid);

drop table if exists scoping_questions;
drop table if exists journey_template_tasks;
drop table if exists journey_template_stages;
drop table if exists journey_templates;
drop table if exists journey_stage_blocks;
drop table if exists journey_roles;

update portal_app_config
   set value = value - 'journey_templates' - 'work_items'
 where key = 'v2_flags';
