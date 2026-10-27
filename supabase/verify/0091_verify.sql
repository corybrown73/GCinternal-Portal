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
  ('complete_solutions carries the purchase record link',
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'complete_solutions'
               and column_name = 'purchased_service_id')),
  ('evidence_proposals carries the component version the suggestion was made against',
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'evidence_proposals'
               and column_name = 'component_version')),
  ('component proposals are allowed by evidence_proposals',
    exists (select 1 from pg_constraint
             where conname = 'evidence_proposals_type_check'
               and pg_get_constraintdef(oid) like '%component_update%')),
  ('all 17 write functions exist',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = any (array[
          'solution_may_edit', 'solution_require_edit', 'solution_check_version',
          'solution_create', 'solution_update', 'solution_set_target',
          'solution_confirm_readiness', 'solution_set_archived', 'solution_save_reviewed_set',
          'component_create', 'component_update', 'component_form_update',
          'component_set_archived', 'dependency_add', 'dependency_remove',
          'post_sale_may_manage', 'implementation_set_owner'])) = 17),
  ('solution write functions are callable by the service role only',
    not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = any (array[
          'solution_may_edit', 'solution_require_edit', 'solution_check_version',
          'solution_create', 'solution_update', 'solution_set_target',
          'solution_confirm_readiness', 'solution_set_archived', 'solution_save_reviewed_set',
          'component_create', 'component_update', 'component_form_update',
          'component_set_archived', 'dependency_add', 'dependency_remove',
          'post_sale_may_manage', 'implementation_set_owner'])
         and (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute')
              or not has_function_privilege('service_role', p.oid, 'execute')))),
  ('Team Lead is a profile flag, with a guard that only an admin or super admin can change',
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'portal_profiles' and column_name = 'team_lead')
    and exists (select 1 from pg_trigger where tgname = 'portal_profiles_team_lead_guard' and not tgisinternal)),
  ('owner history is an append-only record',
    exists (select 1 from pg_trigger where tgname = 'implementation_owner_changes_no_update' and not tgisinternal)),
  ('the owner conflict report exists',
    exists (select 1 from information_schema.views
             where table_schema = 'public' and table_name = 'implementation_owner_conflicts')),
  ('the purchase record link is unique per implementation while active',
    exists (select 1 from pg_indexes
             where schemaname = 'public' and indexname = 'complete_solutions_purchase_link_idx'))
) as t(requirement, ok)
