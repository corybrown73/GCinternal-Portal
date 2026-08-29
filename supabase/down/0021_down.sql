-- Down for 0021_work_item_external.sql
--
-- PRECONDITION: comments and uploaded-file records are customer-authored
-- content. They are ARCHIVED to v2_archive before the tables are dropped, and
-- the archive is retained. The uploaded OBJECTS themselves are not touched —
-- they stay in the private 'attachments' bucket, and v2_archive.work_item_files
-- keeps the path that finds them.
--
-- Deliberately KEPT: work_items.assigned_contact_id / completed_by_contact_id /
-- completed_via. Dropping them would leave a row that says status = 'done' with
-- no record of who completed it — erasing recorded human input, which is the
-- one thing a rollback may not do. They are inert without the rest of the
-- feature, and 0021 re-applies over them with `add column if not exists`.
-- To remove them anyway, after exporting:
--   alter table work_items drop column assigned_contact_id,
--     drop column completed_by_contact_id, drop column completed_via;

do $$
declare
  n_comments int;
  n_files int;
begin
  select count(*) into n_comments from work_item_comments;
  select count(*) into n_files from work_item_files;
  if n_comments > 0 or n_files > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.work_item_comments as table work_item_comments';
    execute 'create table if not exists v2_archive.work_item_files as table work_item_files';
    raise notice 'archived % comment(s) and % file record(s) to v2_archive', n_comments, n_files;
  end if;
end $$;

-- The completion pointers survive on work_items, but who-completed-what is also
-- archived here in isolation so it can be read back without trawling the table.
do $$
declare
  n int;
begin
  select count(*) into n from work_items where completed_via is not null;
  if n > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.work_item_completion as
             select id, implementation_id, assigned_contact_id,
                    completed_by_contact_id, completed_via, completed_at
               from work_items where completed_via is not null';
    raise notice 'archived % external completion pointer(s) to v2_archive.work_item_completion', n;
  end if;
end $$;

drop table if exists work_item_files;
drop table if exists work_item_comments;

alter table work_items drop constraint if exists work_items_completed_via_check;
