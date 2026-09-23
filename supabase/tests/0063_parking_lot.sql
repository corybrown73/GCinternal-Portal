-- Probe: the parking lot exists, RLS on, no grants to anon/authenticated.
do $$
begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='portal_parking_lot') then raise exception '0063: portal_parking_lot missing'; end if;
  if not (select relrowsecurity from pg_class where relname='portal_parking_lot') then raise exception '0063: RLS off'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name='portal_parking_lot' and grantee in ('anon','authenticated')) then raise exception '0063: grants on portal_parking_lot'; end if;
end $$;
