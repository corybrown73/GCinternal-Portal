-- Read-only: is migration 0090 (customers cannot read customer_contacts) in this database?
-- ok = true means the customer-facing policy is GONE and the internal one remains.
select '0090' as migration, requirement, ok from (values
  ('no customer SELECT policy on customer_contacts',
    not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'customer_contacts'
                   and policyname = 'customer_contacts customer select')),
  ('the internal SELECT policy on customer_contacts remains',
    exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'customer_contacts'
               and policyname = 'customer_contacts internal select')),
  ('row level security is on for customer_contacts',
    exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'customer_contacts' and c.relrowsecurity))
) as t(requirement, ok)
