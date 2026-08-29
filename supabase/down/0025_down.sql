-- Down for 0025_audit_consolidation.sql
--
-- Consolidating audit stores and bridging the people tables are the two most
-- destructive things proposed in this project, so this rollback is written to
-- be boring: it removes the MACHINERY (triggers, functions, indexes, the view,
-- the counter table) and leaves every row and every column that could be
-- recorded human input exactly where it is.
--
-- What is deliberately KEPT, and why:
--   * cs_handoffs.health_at_handover / notes / recorded_by / updated_at — a
--     recorded handover is a human statement about a customer. Rolling back the
--     feature that added the form must not erase what people typed into it.
--   * cs_handoffs rows folded forward from graduations — the graduations rows
--     they came from are untouched, so nothing is lost either way, and a row
--     may have been edited since. 0025's backfill is `where not exists`, so a
--     re-apply neither duplicates nor overwrites.
--   * trace_links rows with source = 'manual' — those are links a person drew.
--     Only source = 'derived' rows (this migration's own projection of existing
--     foreign keys) are removed.
--   * trace_links.source itself — needed to tell the two apart, and harmless.
--   * team_members rows the backfill created, and every portal_profiles
--     .team_member_id it set — a team_members row is a PERSON, and 19 tables
--     reference it. Deleting people to roll back a hygiene migration is the
--     single most destructive thing this phase could do.
--   * org_id on the portal_* tables — a defaulted, single-valued seam column
--     that nothing filters on. Dropping it churns nine tables for no gain.
--   * every audit_log and portal_audit_log row, including the trigger-observed
--     ones — they are the record.
--
-- Because those are kept, 0025's up is written with `if not exists` throughout
-- so it survives re-application after this script. CI runs up -> down -> up.
--
-- The one thing this script destroys is saved_views, which IS recorded human
-- input. It therefore REFUSES to run until every row is archived, and verifies
-- the archive by count rather than trusting that the copy happened.

-- ---------------------------------------------------------------------------
-- G. Flags
-- ---------------------------------------------------------------------------
update portal_app_config
   set value = value - 'audit_activity_feed' - 'audit_strict' - 'handover_record'
             - 'trace_links_editing' - 'global_search' - 'saved_views'
             - 'demo_mode' - 'api_key_limits'
 where key = 'v2_flags';

-- ---------------------------------------------------------------------------
-- F. API-key expiry and rate limits
-- ---------------------------------------------------------------------------
-- The usage table is per-minute counters, not evidence, so it is dropped. The
-- two columns on portal_api_keys are configuration a super admin set by hand,
-- so they are kept: an expiry date somebody chose is a decision, and silently
-- un-expiring every key on rollback is exactly the surprise a rollback should
-- never spring. To drop them anyway:
--   alter table portal_api_keys
--     drop column expires_at, drop column rate_limit_per_minute;
drop function if exists portal_api_key_consume(uuid);
drop table if exists portal_api_key_usage;

-- ---------------------------------------------------------------------------
-- E. Saved views — refuse rather than lose them
-- ---------------------------------------------------------------------------
do $$
declare
  live int;
  archived int;
begin
  select count(*) into live from saved_views;
  if live > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.saved_views as table saved_views with no data';
    execute 'insert into v2_archive.saved_views select * from saved_views s '
            'where not exists (select 1 from v2_archive.saved_views a where a.id = s.id)';
    execute 'select count(*) from v2_archive.saved_views a '
            'where exists (select 1 from saved_views s where s.id = a.id)' into archived;
    if archived < live then
      raise exception
        'refusing to drop saved_views: % row(s) live but only % archived. '
        'Export them before rolling 0025 back.', live, archived;
    end if;
    raise notice 'archived % saved view(s) to v2_archive.saved_views', live;
  end if;
end $$;

drop table if exists saved_views;

-- ---------------------------------------------------------------------------
-- D. org_id seam — columns kept (see header). Only the indexes go.
-- ---------------------------------------------------------------------------
drop index if exists portal_accounts_org_idx;
drop index if exists portal_audit_log_org_idx;

-- ---------------------------------------------------------------------------
-- C. Write-orphaned tables
-- ---------------------------------------------------------------------------
-- C3. requirement_scope_changes: restore the write grants 0025 revoked. The
-- deprecation comment is left in place — it is a true statement about the table
-- either way, and a comment has never broken anything.
grant insert, update, delete on requirement_scope_changes to authenticated;

-- C2. cs_handoffs: only the touch trigger is removed. Columns and rows stay.
drop trigger if exists cs_handoffs_touch on cs_handoffs;

-- C1. trace_links: stop deriving, and remove exactly what was derived. Manual
-- links are kept; so is the source column that distinguishes them.
drop trigger if exists technical_solutions_trace_sync on technical_solutions;
drop trigger if exists evidence_trace_sync on evidence;
drop trigger if exists approvals_trace_sync on approvals;
drop function if exists trace_link_sync_solution();
drop function if exists trace_link_sync_related();

delete from trace_links where source = 'derived';

drop index if exists trace_links_edge_uidx;

-- ---------------------------------------------------------------------------
-- B. People — machinery only. No link is unset and no person is deleted.
-- ---------------------------------------------------------------------------
-- The view must go before 0010's down, which drops portal_profiles
-- .team_member_id: a dependent view would block that column drop. Down scripts
-- run newest-first, so this is that ordering.
drop trigger if exists portal_profiles_link_team_member on portal_profiles;
drop function if exists portal_link_team_member();
drop view if exists people;
drop index if exists portal_profiles_team_member_uidx;

-- ---------------------------------------------------------------------------
-- A. Audit stores — the backstop triggers and the feed indexes.
-- ---------------------------------------------------------------------------
-- Every row either trigger wrote is kept. An audit row is the record; a
-- rollback that deletes audit rows is not a rollback, it is a cover-up.
drop trigger if exists portal_api_keys_audit_observe on portal_api_keys;
drop trigger if exists portal_profiles_audit_observe on portal_profiles;
drop function if exists portal_audit_observe_api_key();
drop function if exists portal_audit_observe_role_change();

drop index if exists audit_log_entity_idx;
drop index if exists audit_log_recent_idx;
drop index if exists portal_audit_log_action_idx;
