-- Down for 0014_work_items.sql
--
-- Drops the instance layer. Any plan authored between up and down IS lost —
-- work items, their status history in journey_events, and the record of how
-- each plan was instantiated. Export first if any implementation has been
-- instantiated from a template:
--   \copy (select * from work_items) to 'work_items.csv' csv header
--   \copy (select * from journey_events) to 'journey_events.csv' csv header
--   \copy (select * from journey_instantiations) to 'journey_instantiations.csv' csv header
--
-- implementation_stage_history is NOT touched, by design: it is the authority
-- on stage transitions and 0014 only ever mirrored it. So rolling back loses
-- the mirror, never the record — every implementation keeps its true stage
-- history and renders on the legacy path exactly as before.

do $$
declare
  n int;
begin
  select count(*) into n from work_items;
  if n > 0 and coalesce(current_setting('down.work_items_export_confirmed', true), '') <> '1' then
    raise exception
      'Refusing to drop % work item(s): export them first, then set down.work_items_export_confirmed=1', n;
  end if;
end $$;

drop function if exists resync_stage_instances(uuid);
drop function if exists apply_date_recalc(uuid, jsonb, uuid, jsonb);
drop function if exists advance_templated_stage(uuid, text, uuid, text);
drop function if exists instantiate_journey(uuid, jsonb, uuid, jsonb, jsonb, uuid);
drop function if exists journey_include_when_matches(jsonb, jsonb);

alter table commitments drop column if exists work_item_id;

drop table if exists implementation_role_assignments;
drop table if exists journey_instantiations;
drop table if exists journey_events;
drop table if exists scoping_answers;
drop table if exists work_items;
drop table if exists stage_instances;

alter table implementations
  drop column if exists kickoff_at,
  drop column if exists template_version,
  drop column if exists journey_type,
  drop column if exists journey_template_id;
