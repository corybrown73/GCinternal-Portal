-- Down for 0034_stage_gates.sql
--
-- Drops the flag and the trigger that copies it. The UPDATE that set is_gate on
-- template tasks needs no separate reversal: the column it wrote to is being
-- dropped with it.
--
-- Order matters. The trigger reads journey_template_tasks.is_gate, so it goes
-- first; dropping the column out from under a live trigger would leave the next
-- insert into work_items failing on a column that no longer exists.

drop trigger if exists work_items_gate_from_template on work_items;
drop function if exists work_item_gate_from_template();

alter table work_items drop column if exists is_gate;
alter table journey_template_tasks drop column if exists is_gate;
