-- Down for 0009_rls_profile_exposure.sql — restores the 0001 policy verbatim.
drop policy "profiles self or internal read" on portal_profiles;

create policy "profiles readable" on portal_profiles
  for select to authenticated using (true);
