-- Reverses 0083. Refuses while any implementation runs the partner journey or
-- names a partner: those are records, not to be deleted.
do $$
begin
  if exists (select 1 from implementations where partner_key is not null)
     or exists (select 1 from journey_templates t
                 where t.journey_type = 'partner_implementation'
                   and exists (select 1 from implementations i where i.journey_template_id = t.id))
     or exists (select 1 from work_items where due_basis = 'unscheduled') then
    raise exception 'Partner implementations exist; they must be completed or moved before 0083 is reversed';
  end if;
  drop function if exists create_partner_implementation(uuid, jsonb, uuid, text, text, jsonb, uuid, uuid, timestamptz);
  delete from journey_templates where key = 'partner-implementation';
  alter table work_items drop constraint if exists work_items_due_basis_check;
  alter table work_items add constraint work_items_due_basis_check
    check (due_basis in ('project_start', 'stage_entry', 'target_launch'));
  alter table journey_template_tasks drop constraint if exists journey_template_tasks_offset_basis_check;
  alter table journey_template_tasks add constraint journey_template_tasks_offset_basis_check
    check (offset_basis in ('project_start', 'stage_entry', 'target_launch'));
  alter table implementations drop constraint if exists implementations_partner_key_check;
  alter table implementations drop column if exists partner_key;
  alter table journey_templates drop constraint if exists journey_templates_journey_type_check;
  alter table journey_templates add constraint journey_templates_journey_type_check check (
    journey_type in ('new_logo', 'add_on', 'integration', 'data_migration', 'rollout', 'recovery')
  );
end $$;
