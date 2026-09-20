-- Probe: the column exists, is a date, and is nullable.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'portal_gong_reports'
      and column_name = 'call_date' and data_type = 'date' and is_nullable = 'YES'
  ) then
    raise exception '0054: portal_gong_reports.call_date missing or wrong shape';
  end if;
end $$;
