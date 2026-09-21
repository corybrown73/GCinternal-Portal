-- Probe: both tables exist with RLS on and no grants to anon/authenticated.
do $$
declare t text;
begin
  foreach t in array array['portal_help_articles','portal_help_clicks'] loop
    if not exists (select 1 from pg_tables where schemaname='public' and tablename=t) then raise exception '0060: % missing', t; end if;
    if not (select relrowsecurity from pg_class where relname=t) then raise exception '0060: RLS off on %', t; end if;
    if exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name=t and grantee in ('anon','authenticated')) then raise exception '0060: grants on %', t; end if;
  end loop;
end $$;
