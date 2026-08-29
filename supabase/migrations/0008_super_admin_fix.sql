-- portal_is_admin() predates the role rework and only recognized the legacy
-- 'admin' role. Every policy and trigger that references it (api keys, TAM
-- decisions, role-change guard, config writes) must also accept 'super_admin'.
create or replace function portal_is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from portal_profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;
