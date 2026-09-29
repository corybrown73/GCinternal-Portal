-- Probe for 0067: the column exists and takes text. Seeds inside a
-- transaction it rolls back.
begin;
do $$
declare v_name text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'portal_accounts' and column_name = 'display_name'
  ) then
    raise exception '0067: portal_accounts.display_name is missing';
  end if;
  insert into public.portal_accounts (id, name, stage, display_name)
  values ('00000000-0000-4000-8000-000000000067', 'PROBE-DR NL', 'prospect', 'Probe Holdings');
  select display_name into v_name from public.portal_accounts where id = '00000000-0000-4000-8000-000000000067';
  if v_name <> 'Probe Holdings' then raise exception '0067: display_name not written'; end if;
  raise notice 'probe 0067 ok';
end $$;
rollback;
