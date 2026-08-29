-- Down for 0022_plan_snapshots.sql
--
-- PRECONDITION: a snapshot is a record of what we told a customer in a given
-- week — it is evidence, not a cache, and it cannot be regenerated (the plan it
-- froze has moved on). Rows are ARCHIVED to v2_archive before the table is
-- dropped, and the archive is retained.
--
-- Note on share links: dropping the table revokes every live snapshot share
-- immediately, because the token can no longer be resolved. A PDF a customer
-- already downloaded is, as ever, beyond recall.

do $$
declare
  n int;
begin
  select count(*) into n from plan_snapshots;
  if n > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.plan_snapshots as table plan_snapshots';
    raise notice 'archived % plan snapshot(s) to v2_archive.plan_snapshots', n;
  end if;
end $$;

drop table if exists plan_snapshots;
