-- 0009 — Close the portal_profiles read exposure.
--
-- 0001 created `profiles readable ... using (true)`, which lets customer-role
-- logins read every internal staff profile (name, email, role) through the
-- publishable-key client. App traffic runs service-role and is unaffected;
-- the browser only ever reads its own row (useProfile in src/lib/auth.ts).
--
-- New rule: a user reads their own row; internal roles read everyone.
-- Rollback: supabase/down/0009_down.sql (restores the 0001 policy verbatim).

drop policy "profiles readable" on portal_profiles;

create policy "profiles self or internal read" on portal_profiles
  for select to authenticated
  using (id = auth.uid() or portal_is_internal());
