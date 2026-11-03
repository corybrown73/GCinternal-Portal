-- Read-only: is migration 0088 (owner changes in one locked place, with history) in this database?
-- Every row true means the history table, both owner triggers, the claim and
-- assignment functions, and the narrowed direct-write policies are all present.
select '0088' as migration, requirement, ok from (values
  ('implementation_owner_history exists with row level security on',
    exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'implementation_owner_history'
               and c.relrowsecurity)),
  ('owner history rows cannot be changed (immutable trigger)',
    exists (select 1 from pg_trigger
             where tgname = 'implementation_owner_history_immutable' and not tgisinternal)),
  ('implementations has the owner guard trigger',
    exists (select 1 from pg_trigger
             where tgname = 'implementations_owner_guard' and not tgisinternal)),
  ('implementations records every owner change (history trigger)',
    exists (select 1 from pg_trigger
             where tgname = 'implementations_owner_history' and not tgisinternal)),
  ('portal_claim_deal exists',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'portal_claim_deal')),
  ('portal_set_implementation_owner exists',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'portal_set_implementation_owner')),
  ('portal_record_assignment takes the 0088 signature (nine arguments)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'portal_record_assignment'
               and p.pronargs = 9)),
  ('signed-in users can no longer write portal_assignments directly',
    not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'portal_assignments'
                   and policyname = 'assignments internal')),
  ('signed-in users can no longer write team_members directly',
    not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'team_members'
                   and policyname like 'team\_members internal %'
                   and policyname <> 'team_members internal select'))
) as t(requirement, ok)
