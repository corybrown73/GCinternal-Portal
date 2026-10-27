-- Reverses 0091. Refuses to drop human-entered solution records, components,
-- dependencies, history or component proposals unless an export has been
-- confirmed (down.complete_solutions_export_confirmed). Production stays strict:
-- the CI replay grants the confirmation on a database thrown away minutes later.
do $$
begin
  if (exists (select 1 from public.complete_solutions)
      or exists (select 1 from public.solution_components)
      or exists (select 1 from public.solution_events)
      or exists (select 1 from public.evidence_proposals where type = 'component_update'))
     and coalesce(current_setting('down.complete_solutions_export_confirmed', true), '') <> '1' then
    raise exception 'Refusing to drop complete solutions: export them and set down.complete_solutions_export_confirmed';
  end if;
end $$;

alter table public.evidence_proposals drop constraint if exists evidence_proposals_type_check;
delete from public.evidence_proposals where type = 'component_update';
alter table public.evidence_proposals add constraint evidence_proposals_type_check check (
  type in ('risk', 'issue', 'decision', 'target_date', 'owner', 'note', 'intake_suggestion')
);
alter table public.evidence_proposals
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
