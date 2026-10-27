-- Reverses 0091. Refuses to drop human-entered solution records, components,
-- dependencies, history or component proposals unless an export has been
-- confirmed (down.complete_solutions_export_confirmed). Production stays strict:
-- the CI replay grants the confirmation on a database thrown away minutes later.
do $$
begin
  if (exists (select 1 from public.complete_solutions)
      or exists (select 1 from public.solution_components)
      or exists (select 1 from public.solution_events)
      or exists (select 1 from public.implementation_owner_changes)
      or exists (select 1 from public.evidence_proposals where type = 'component_update'))
     and coalesce(current_setting('down.complete_solutions_export_confirmed', true), '') <> '1' then
    raise exception 'Refusing to drop complete solutions: export them and set down.complete_solutions_export_confirmed';
  end if;
end $$;

-- The owner-conflict view reads the journey's role assignments, so it goes first.
drop view if exists public.implementation_owner_conflicts;

drop trigger if exists portal_profiles_team_lead_guard on public.portal_profiles;
drop function if exists public.portal_guard_team_lead();
drop table if exists public.implementation_owner_changes;
drop function if exists public.implementation_owner_changes_append_only();
drop function if exists public.implementation_set_owner(uuid, uuid, uuid, text);
drop function if exists public.post_sale_may_manage(uuid, uuid);
alter table public.portal_profiles drop column if exists team_lead;

-- Functions first: they name the tables, so they go before the tables do.
drop function if exists public.solution_save_reviewed_set(uuid, uuid, text, jsonb);
drop function if exists public.dependency_remove(uuid, uuid, uuid);
drop function if exists public.dependency_add(uuid, uuid, uuid, boolean);
drop function if exists public.component_set_archived(uuid, uuid, timestamptz, boolean, text);
drop function if exists public.component_form_update(uuid, uuid, timestamptz, jsonb);
drop function if exists public.component_update(uuid, uuid, timestamptz, jsonb, text);
drop function if exists public.component_create(uuid, uuid, text, text, text, text, date, text, integer, text, text);
drop function if exists public.solution_set_archived(uuid, uuid, timestamptz, boolean, text);
drop function if exists public.solution_confirm_readiness(uuid, uuid, timestamptz, text, text);
drop function if exists public.solution_set_target(uuid, uuid, timestamptz, date, text);
drop function if exists public.solution_update(uuid, uuid, timestamptz, jsonb);
drop function if exists public.solution_create(uuid, uuid, text, text, text, text, integer, text, text, text, date, text);
drop function if exists public.solution_check_version(timestamptz, timestamptz);
drop function if exists public.solution_require_edit(uuid, uuid);
drop function if exists public.solution_may_edit(uuid, uuid);

alter table public.evidence_proposals drop constraint if exists evidence_proposals_type_check;
delete from public.evidence_proposals where type = 'component_update';
alter table public.evidence_proposals add constraint evidence_proposals_type_check check (
  type in ('risk', 'issue', 'decision', 'target_date', 'owner', 'note', 'intake_suggestion')
);
alter table public.evidence_proposals
  drop column if exists component_version,
  drop column if exists component_value,
  drop column if exists component_field,
  drop column if exists solution_component_id;

drop table if exists public.solution_events;
drop table if exists public.solution_component_dependencies;
drop table if exists public.solution_components;
drop table if exists public.complete_solutions;
drop function if exists public.solution_events_append_only();
drop function if exists public.solution_dependency_enforce();
drop function if exists public.solution_component_enforce();
