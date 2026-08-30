-- Down for 0038_audit_entity_key.sql
--
-- Drops the column, its index and the mutual-exclusion constraint.
--
-- WHAT IS LOST, plainly: every audit row that recorded a text-keyed entity —
-- feature-flag toggles, stage renames — keeps its action, actor, timestamp and
-- payload, and loses the indexed identity of the thing that changed. The key
-- also lives in `payload` for the callers that write one, so the information
-- survives in a form you have to scan for rather than look up.
--
-- Rolling back does NOT restore the previous behaviour, and could not: before
-- this migration those writes did not fail gracefully, they failed outright and
-- raised a Critical alert each time. There is no version of this schema in
-- which a flag toggle is audited correctly without this column.

drop index if exists portal_audit_log_entity_key_idx;

alter table portal_audit_log
  drop constraint if exists portal_audit_log_one_entity_ref;

alter table portal_audit_log
  drop column if exists entity_key;
