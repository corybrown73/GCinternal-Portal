-- Read-only: is migration 0086 (milestone override path) in this database?
-- The function exists from 0082; 0086 replaces its body, so the check reads the
-- body for the line only 0086 has.
select '0086' as migration, requirement, ok from (values
  ('portal_record_milestone_date_change creates the timeline.overrides object',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'portal_record_milestone_date_change'
               and p.prosrc like '%jsonb_typeof(intake #> ''{timeline,overrides}'')%'))
) as t(requirement, ok)
