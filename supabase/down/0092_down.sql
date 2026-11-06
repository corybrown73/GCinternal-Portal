-- Reverses 0092. Refuses to drop anything a person entered, unless its export has
-- been confirmed. Set down.training_export_confirmed = 1 only after exporting
-- implementation_training, the training proposals and the readiness evidence they created.
--
-- Production is not rolled back with this file. The schema is additive; the application
-- is reverted instead (docs/RELEASE-PR101.md). Read that before running any part of this
-- on a database that holds real records.
do $$
begin
  if (exists (select 1 from public.implementation_training)
      or exists (select 1 from public.evidence_proposals where type like 'training\_%' escape '\')
      or exists (select 1 from public.evidence where type = 'training_readiness'))
     and coalesce(current_setting('down.training_export_confirmed', true), '') <> '1' then
    raise exception 'Refusing to drop implementation training: export it and set down.training_export_confirmed';
  end if;
end $$;

-- Training proposals and the readiness evidence they created go with the table.
delete from public.evidence_proposals where type like 'training\_%' escape '\';
delete from public.evidence where type = 'training_readiness';

alter table public.evidence_proposals drop constraint if exists evidence_proposals_type_check;
alter table public.evidence_proposals add constraint evidence_proposals_type_check check (
  type in ('risk', 'issue', 'decision', 'target_date', 'owner', 'note', 'intake_suggestion', 'component_update')
);
alter table public.evidence_proposals
  drop column if exists training_version,
  drop column if exists training_date,
  drop column if exists training_value,
  drop column if exists training_field,
  drop column if exists training_id;

drop function if exists public.training_demonstrate_from_transcript(uuid, uuid, timestamptz, text, uuid, text);
drop function if exists public.training_set_archived(uuid, uuid, timestamptz, boolean, text);
drop function if exists public.training_record_demonstration(uuid, uuid, timestamptz, text, uuid, text);
drop function if exists public.training_record_delivery(uuid, uuid, timestamptz, date, text);
drop function if exists public.training_update(uuid, uuid, timestamptz, jsonb, text);
drop function if exists public.training_create(uuid, uuid, jsonb, text);
drop function if exists public.training_check_responsibility(text, text, text);
drop function if exists public.training_require_person(uuid);
drop function if exists public.training_require_edit(uuid, uuid);
drop table if exists public.implementation_training cascade;
drop function if exists public.implementation_training_enforce();

-- Put the 0091 solution tables back the way 0091 left them: internal users could
-- read and write under their policies.
drop policy if exists "complete_solutions internal read" on public.complete_solutions;
create policy "complete_solutions internal" on public.complete_solutions
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
drop policy if exists "solution_components internal read" on public.solution_components;
create policy "solution_components internal" on public.solution_components
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
drop policy if exists "solution_component_dependencies internal read" on public.solution_component_dependencies;
create policy "solution_component_dependencies internal" on public.solution_component_dependencies
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
grant select, insert, update, delete on public.complete_solutions, public.solution_components,
  public.solution_component_dependencies, public.solution_events to authenticated, anon;
