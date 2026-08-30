-- Down for 0033_apply_template_to_existing.sql
--
-- Removes apply_journey_template, puts backfill_template_tasks_forward back to
-- the body 0032 shipped, and returns sf_fallback_template to its seeded
-- placeholder.
--
-- NOT REVERSED, deliberately: the UPDATE that set implementations.template_version
-- to match the template each row already points at. That column was wrong —
-- three production rows pointed at New Logo v2 while claiming v1 — and putting
-- a wrong number back is not a rollback, it is vandalism. The join to
-- journey_templates remains the authority either way, so leaving the column
-- correct changes nothing a caller can observe except that it stops lying.
--
-- Also not reversed: any stage_instances or work_items that
-- apply_journey_template created while it existed. This migration creates none
-- itself — it only defines the function — and those rows are a project plan
-- somebody has since worked against. 0014's down refuses to destroy work items
-- without an explicit export confirmation, and that judgement holds here.

drop function if exists apply_journey_template(uuid, uuid, jsonb, jsonb, uuid);

-- Restore the 0032 body verbatim.
create or replace function backfill_template_tasks_forward(
  p_implementation_id uuid,
  p_template_id uuid
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_impl    record;
  v_cur_pos int;
  v_made    int;
begin
  select i.id, i.current_stage, i.target_launch_date into v_impl
    from implementations i where i.id = p_implementation_id;
  if not found then
    raise exception 'backfill_template_tasks_forward: no implementation %',
      p_implementation_id;
  end if;

  -- Re-point the stage instances at the new template's stage rows. Matching on
  -- stage_key, which is the stable identity across versions.
  update stage_instances si
     set template_stage_id = s2.id
    from journey_template_stages s2
   where si.implementation_id = v_impl.id
     and s2.template_id = p_template_id
     and s2.stage_key = si.stage_key;

  update implementations set journey_template_id = p_template_id
   where id = v_impl.id;

  select position into v_cur_pos
    from stage_instances
   where implementation_id = v_impl.id and stage_key = v_impl.current_stage;

  -- No stage instance for the current stage means this implementation was
  -- never instantiated at all. Give it everything rather than nothing.
  if v_cur_pos is null then v_cur_pos := 0; end if;

  insert into work_items
    (implementation_id, stage_instance_id, template_task_id, task_key, title,
     description, position, role_key, party, visibility, due_basis,
     due_offset_days, duration_days, due_at)
  select v_impl.id, si.id, k.id, k.task_key, k.title, k.description,
         k.position, k.role_key, k.party, k.visibility, k.offset_basis,
         k.offset_days, k.duration_days,
         -- Dates are computed from the inputs and stored beside them, so a due
         -- date can always show its reasoning. NULL where the basis has nothing
         -- to anchor to yet: a stage not entered, or no launch date agreed. A
         -- guessed date would be worse than a blank one.
         case k.offset_basis
           when 'stage_entry' then
             case when si.entered_at is null then null
                  else si.entered_at + (k.offset_days || ' days')::interval end
           when 'target_launch' then
             case when v_impl.target_launch_date is null then null
                  else v_impl.target_launch_date::timestamptz
                       + (k.offset_days || ' days')::interval end
           when 'project_start' then
             (select min(x.entered_at) from stage_instances x
               where x.implementation_id = v_impl.id and x.entered_at is not null)
             + (k.offset_days || ' days')::interval
         end
    from journey_template_tasks k
    join journey_template_stages s2 on s2.id = k.template_stage_id
    join stage_instances si
      on si.implementation_id = v_impl.id and si.stage_key = s2.stage_key
   where k.template_id = p_template_id
     and s2.position >= v_cur_pos
  -- Replay-safe: work_items_task_key_unique (implementation_id, task_key).
  on conflict (implementation_id, task_key) do nothing;

  get diagnostics v_made = row_count;

  -- Dependencies, resolved after the rows exist. A dependency naming a task
  -- that was NOT created (it belongs to a stage already passed) is dropped
  -- rather than left dangling: the work it named is behind us.
  update work_items w
     set depends_on = coalesce((
           select array_agg(d.id)
             from journey_template_tasks k2
             join unnest(k2.depends_on_keys) as dep_key on true
             join work_items d
               on d.implementation_id = w.implementation_id
              and d.task_key = dep_key
            where k2.id = w.template_task_id
         ), '{}')
   where w.implementation_id = v_impl.id
     and w.template_task_id is not null;

  return v_made;
end $$;

revoke execute on function backfill_template_tasks_forward(uuid, uuid)
  from public, anon, authenticated;
grant execute on function backfill_template_tasks_forward(uuid, uuid) to service_role;

update portal_app_config
   set value = '"none"'::jsonb, updated_at = now()
 where key = 'sf_fallback_template'
   and value = '"new-logo"'::jsonb;
