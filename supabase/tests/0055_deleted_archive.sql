-- Probe: the table exists, RLS is on, and anon/authenticated hold no grants.
do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'portal_deleted_archive') then
    raise exception '0055: portal_deleted_archive missing';
  end if;
  if not (select relrowsecurity from pg_class where relname = 'portal_deleted_archive') then
    raise exception '0055: RLS not enabled';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'portal_deleted_archive'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception '0055: anon/authenticated still hold grants';
  end if;
end $$;
