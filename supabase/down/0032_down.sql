-- Down for 0032_seed_new_logo_v2_tasks.sql
--
-- Removes only what 0032 created: the work items whose template_task_id points
-- at a v2 task, the v2 template with its stages and tasks, and the re-pointing
-- of live implementations back to v1.
--
-- Deliberately narrow. 0014's down refuses to destroy work items without an
-- explicit export confirmation, and rightly so, because a work item can carry
-- human input. These ones cannot: they were machine-created by 0032 and are
-- identified by their v2 provenance. A work item somebody typed by hand has a
-- NULL template_task_id and is never touched here.
--
-- THE ORDER IS THE WHOLE DIFFICULTY, and it is the exact mirror of
-- publish_template's, which notes: "stamp the outgoing version's
-- superseded_by_id FIRST so it leaves the partial unique index, then mark the
-- draft published." Undoing that runs into three constraints that each block a
-- different naive order:
--
--   1. `journey_templates_current_idx` is a partial unique index over
--      (org_id, key) where published and not superseded. Clearing v1's
--      superseded_by_id while v2 is still published gives the family two live
--      versions and the index refuses it.
--   2. `journey_templates_superseded_by_id_fkey` — v1 points AT v2, so v2
--      cannot be deleted while that pointer stands.
--   3. `journey_template_frozen` fires on delete of stages and tasks and
--      raises if their template is published. The cascade from deleting a
--      published v2 trips it.
--
-- One order satisfies all three: archive v2 (leaves the index, unfreezes its
-- content), clear v1's pointer (safe now), then delete v2 (cascade allowed),
-- then restore v1.

do $$
declare
  v1_id uuid;
  v2_id uuid;
begin
  select id into v2_id from journey_templates
   where key = 'new-logo' and version = 2;
  if v2_id is null then
    raise notice '0032 down: no New Logo v2, nothing to undo';
    return;
  end if;
  select id into v1_id from journey_templates
   where key = 'new-logo' and version = 1;

  -- Work items created from v2 tasks, removed while they are still
  -- identifiable. template_task_id is ON DELETE SET NULL, so dropping the
  -- template first would orphan them into unattributable rows rather than
  -- delete them.
  delete from work_items w
   using journey_template_tasks k
   where w.template_task_id = k.id and k.template_id = v2_id;

  -- Point the stage instances and implementations back at v1.
  if v1_id is not null then
    update stage_instances si
       set template_stage_id = s1.id
      from journey_template_stages s1
     where s1.template_id = v1_id
       and s1.stage_key = si.stage_key
       and si.template_stage_id in (
         select id from journey_template_stages where template_id = v2_id
       );

    update implementations set journey_template_id = v1_id
     where journey_template_id = v2_id;
  else
    update implementations set journey_template_id = null
     where journey_template_id = v2_id;
  end if;

  -- Constraint 1 and 3: archiving takes v2 out of the live-version index and
  -- unfreezes its content so the cascade below is permitted.
  update journey_templates set status = 'archived', updated_at = now()
   where id = v2_id;

  -- Constraint 2: release v1's pointer before deleting what it points at.
  if v1_id is not null then
    update journey_templates set superseded_by_id = null, updated_at = now()
     where id = v1_id;
  end if;

  -- Stages and tasks cascade from the template.
  delete from journey_templates where id = v2_id;

  raise notice '0032 down: New Logo v2 removed, implementations back on v1';
end $$;

drop function if exists backfill_template_tasks_forward(uuid, uuid);
