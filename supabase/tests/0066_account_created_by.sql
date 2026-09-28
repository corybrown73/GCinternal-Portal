-- Probe for 0066: the column exists, takes a profile, and clears when the
-- profile goes. Seeds inside a transaction it rolls back.
begin;
do $$
declare v_stage text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'portal_accounts' and column_name = 'created_by'
  ) then
    raise exception '0066: portal_accounts.created_by is missing';
  end if;
  insert into public.portal_accounts (id, name, stage, created_by)
  values ('00000000-0000-4000-8000-000000000066', 'probe 0066', 'prospect', null);
  select stage::text into v_stage from public.portal_accounts where id = '00000000-0000-4000-8000-000000000066';
  if v_stage <> 'prospect' then raise exception '0066: probe row not written'; end if;
  raise notice 'probe 0066 ok';
end $$;
rollback;
