-- Down for 0020_audit_stores.sql
--
-- The rule that shapes this file: an audit row is evidence. Narrowing the
-- actor_type vocabulary back would fail on any row that already says
-- 'external_contact', and the tempting fix — rewriting those rows to 'system' —
-- would turn the audit trail into a lie about who did the thing. So the rows
-- are ARCHIVED and removed instead, and the archive is retained forever.
--
-- Deliberately KEPT: audit_log's three actor columns. They hold the recorded
-- identity of a named person who did something; rolling back a feature is not a
-- reason to erase that. 0020 re-applies over them with `add column if not
-- exists`.

do $$
declare
  n int;
begin
  select count(*) into n from portal_audit_log where actor_type = 'external_contact';
  if n > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.portal_audit_log_external
             (like portal_audit_log including defaults)';
    execute 'insert into v2_archive.portal_audit_log_external
             select * from portal_audit_log where actor_type = ''external_contact''';
    delete from portal_audit_log where actor_type = 'external_contact';
    raise notice 'archived % external portal_audit_log row(s) to v2_archive.portal_audit_log_external', n;
  end if;
end $$;

do $$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.portal_audit_log'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%actor_type%';
  if cname is not null then
    execute format('alter table portal_audit_log drop constraint %I', cname);
  end if;
end $$;

alter table portal_audit_log
  add constraint portal_audit_log_actor_type_check
  check (actor_type in ('user', 'api_key', 'email_token', 'system'));

-- The audit_log columns stay (see header); only the vocabulary constraint this
-- migration introduced is removed, so a later re-apply can re-add it cleanly.
alter table audit_log drop constraint if exists audit_log_actor_type_check;
