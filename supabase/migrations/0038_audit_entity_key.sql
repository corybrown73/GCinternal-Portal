-- 0038 — audit rows for entities that are not uuids
--
-- THE BUG. `portal_audit_log.entity_id` is a uuid. Feature flags are text-keyed
-- — "demo_mode", "trace_links_editing" — so every toggle sent a flag name into
-- a uuid column and Postgres refused it:
--
--   invalid input syntax for type uuid: "trace_links_editing"
--
-- The audit helper retries once, then raises a Critical alert, so each toggle
-- also manufactured an alert. Three were sitting open. Meanwhile the Features
-- page states "Every change is recorded against your name" and not one of them
-- was — the page promised an audit trail while producing an alert instead.
--
-- WHY A COLUMN RATHER THAN entity_id: null AND THE KEY IN payload. Flags are
-- not the only text-keyed thing here: lifecycle stages and pipeline stages are
-- keyed by text too, and both are editable. Burying their identity in a jsonb
-- blob means "show me every change to the demo_mode flag" becomes a payload
-- scan rather than an indexed lookup, and the next text-keyed entity repeats
-- the decision from scratch.
--
-- Exactly one of the two is set, enforced below. A row carrying both would give
-- two answers to "what was changed", and a row carrying neither is an event
-- about nothing — which is legitimate for actions like a sign-in, so the
-- constraint permits it and forbids only the ambiguous case.

alter table portal_audit_log
  add column if not exists entity_key text;

alter table portal_audit_log
  drop constraint if exists portal_audit_log_one_entity_ref;

alter table portal_audit_log
  add constraint portal_audit_log_one_entity_ref
  check (entity_id is null or entity_key is null);

create index if not exists portal_audit_log_entity_key_idx
  on portal_audit_log (entity_type, entity_key)
  where entity_key is not null;

comment on column portal_audit_log.entity_key is
  'The identity of a text-keyed entity — a feature flag, a lifecycle stage, a '
  'pipeline stage. Mutually exclusive with entity_id, which is for uuid-keyed '
  'rows. Never both.';
