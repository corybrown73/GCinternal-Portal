-- Read-only: is migration 0092 (implementation training) in this database?
select '0092' as migration, requirement, ok from (values
  ('table implementation_training exists',
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'implementation_training')),
  ('training rows are read through row level security',
    exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'implementation_training' and c.relrowsecurity)),
  ('the enforcement trigger is present',
    exists (select 1 from pg_trigger where tgname = 'implementation_training_enforce_trg' and not tgisinternal)),
  ('evidence_proposals carries the training version the suggestion was made against',
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'evidence_proposals'
               and column_name = 'training_version')),
  ('evidence_proposals accepts the five training proposal types',
    exists (select 1 from pg_constraint
             where conname = 'evidence_proposals_type_check'
               and pg_get_constraintdef(oid) like '%training_follow_up%'
               and pg_get_constraintdef(oid) like '%training_demonstrated%'
               and pg_get_constraintdef(oid) like '%component_update%')),
  ('the training write functions exist (9)',
    (select count(*) = 9 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'training_require_edit', 'training_require_person', 'training_check_responsibility',
        'training_create', 'training_update', 'training_record_delivery',
        'training_record_demonstration', 'training_demonstrate_from_transcript', 'training_set_archived'))),
  ('training write functions are callable by the service role only',
    not exists (select 1 from information_schema.routine_privileges
                 where routine_schema = 'public' and routine_name like 'training_%'
                   and grantee in ('anon', 'authenticated', 'public')
                   and privilege_type = 'EXECUTE')),
  ('signed-in users have no direct write access to training or the 0091 solution tables',
    not exists (select 1 from information_schema.role_table_grants
                 where grantee in ('authenticated', 'anon') and table_schema = 'public'
                   and table_name in ('implementation_training', 'complete_solutions', 'solution_components',
                                      'solution_component_dependencies', 'solution_events')
                   and privilege_type in ('INSERT', 'UPDATE', 'DELETE')))
) as v(requirement, ok);
