-- Read-only: is migration 0091 (complete solutions) in this database?
select '0091' as migration, requirement, ok from (values
  ('table complete_solutions exists',
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'complete_solutions')),
  ('table solution_components exists',
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'solution_components')),
  ('table solution_component_dependencies exists',
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'solution_component_dependencies')),
  ('table solution_events exists',
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'solution_events')),
  ('solution_events refuses updates (append-only trigger present)',
    exists (select 1 from pg_trigger where tgname = 'solution_events_no_update' and not tgisinternal)),
  ('component proposals are allowed by evidence_proposals',
    exists (select 1 from pg_constraint
             where conname = 'evidence_proposals_type_check'
               and pg_get_constraintdef(oid) like '%component_update%'))
) as t(requirement, ok)
