-- Read-only: is migration 0085 (test accounts) in this database?
select '0085' as migration, requirement, ok from (values
  ('portal_accounts.is_test exists',
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'portal_accounts' and column_name = 'is_test')),
  ('customers.is_test exists',
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'customers' and column_name = 'is_test'))
) as t(requirement, ok)
