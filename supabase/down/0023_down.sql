-- Down for 0023_sf_integration.sql
--
-- What this KEEPS, by archiving to v2_archive rather than dropping:
--   integration_sync_log   — the only record of why each Salesforce-created
--                            implementation exists: which idempotency branch
--                            ran, which template rules were evaluated and how
--                            each one voted, the drift reports, the adopted
--                            customer evidence, and the SE emails that have
--                            nowhere else to live yet.
--   integration_events     — the outbox history.
--   webhook_deliveries     — what we sent, when, and what came back.
--   webhook_endpoints      — who was subscribed to what.
--   integration_field_maps — the mapping configuration a person tuned.
--   the supersession pointers, as a table of (old, new, opportunity id).
--
-- What this DESTROYS, deliberately and unrecoverably:
--   webhook_endpoint_secrets — the encrypted signing secrets. They are NOT
--     archived: a v2_archive table carries no RLS, so parking ciphertext there
--     would put it somewhere weaker than where it started. Secrets are shown
--     once at creation, so every consumer must be re-keyed if 0023 is
--     re-applied later.
--   implementations.sf_closed_won_at — Salesforce's own statement of the close
--     date. Export it first if it matters:
--       \copy (select id, salesforce_opportunity_id, sf_closed_won_at
--              from implementations where sf_closed_won_at is not null)
--         to 'sf_closed_won.csv' csv header
--   implementations.salesforce_account_id — denormalized; recoverable from
--     customers.salesforce_account_id via the customer link.
--
-- What this does NOT revert: the 15→18 id normalization. The original values
-- are in portal_audit_log (actions account.sf_id_normalized,
-- customer.sf_id_normalized, implementation.sf_id_normalized) and reverting
-- them would re-break every join that now works. To revert deliberately:
--   update portal_accounts a set salesforce_id = l.payload ->> 'from'
--     from portal_audit_log l
--    where l.action = 'account.sf_id_normalized' and l.entity_id = a.id;
--   (and the same shape for customers / implementations)

-- ---------------------------------------------------------------------------
-- 1. Archive the evidence.
-- ---------------------------------------------------------------------------
-- `create table (like …)` then `insert … select` rather than `create table as`:
-- rolling back twice into the same database must APPEND to the archive, not
-- silently skip because the archive table already exists.
do $$
declare
  t text;
  n_sync int := 0;
  n_events int := 0;
begin
  create schema if not exists v2_archive;

  select count(*) into n_sync from integration_sync_log;
  select count(*) into n_events from integration_events;

  foreach t in array array[
    'integration_sync_log',
    'integration_events',
    'webhook_deliveries',
    'webhook_endpoints',
    'integration_field_maps'
  ] loop
    execute format('create table if not exists v2_archive.%I (like public.%I)', t, t);
    execute format('insert into v2_archive.%I select * from public.%I', t, t);
  end loop;

  -- The supersession graph lives in a column that is about to be dropped.
  create table if not exists v2_archive.sf_superseded_implementations (
    old_implementation_id uuid,
    new_implementation_id uuid,
    salesforce_opportunity_id text,
    sf_closed_won_at timestamptz,
    archived_at timestamptz
  );
  insert into v2_archive.sf_superseded_implementations
  select id, superseded_by_implementation_id, salesforce_opportunity_id, sf_closed_won_at, now()
    from implementations
   where superseded_by_implementation_id is not null;

  raise notice 'archived % sync-log row(s) and % outbox row(s) to v2_archive', n_sync, n_events;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Guards and functions.
-- ---------------------------------------------------------------------------
drop trigger if exists implementations_sf_identity_guard_trg on implementations;
drop function if exists implementations_sf_identity_guard();
drop function if exists sf_create_implementation(uuid, jsonb, uuid, text, text, timestamptz, uuid);
drop function if exists sf_supersede_implementation(uuid, jsonb, text, uuid);

-- ---------------------------------------------------------------------------
-- 3. Identity indexes: put 0010's back.
-- ---------------------------------------------------------------------------
-- 0010's index is unique across every row holding an opportunity id, so a
-- superseded row and its follow-on cannot both keep the id. The superseded
-- (older) row releases it — the follow-on is the current implementation, and
-- the pairing survives in v2_archive.sf_superseded_implementations above.
update implementations
   set salesforce_opportunity_id = null
 where superseded_by_implementation_id is not null
   and salesforce_opportunity_id is not null;

drop index if exists implementations_superseded_by_idx;
drop index if exists implementations_sf_opp_idx;
drop index if exists implementations_sf_opp_current_uidx;

create unique index if not exists implementations_sf_opportunity_idx
  on implementations (salesforce_opportunity_id)
  where salesforce_opportunity_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Columns.
-- ---------------------------------------------------------------------------
alter table implementations
  drop column if exists superseded_by_implementation_id,
  drop column if exists sf_closed_won_at,
  drop column if exists salesforce_account_id;

-- ---------------------------------------------------------------------------
-- 5. Tables (deliveries and secrets first — both reference endpoints).
-- ---------------------------------------------------------------------------
drop table if exists webhook_deliveries;
drop table if exists webhook_endpoint_secrets;
drop table if exists webhook_endpoints;
drop table if exists integration_field_maps;
drop table if exists integration_sync_log;
drop table if exists integration_events;

-- ---------------------------------------------------------------------------
-- 6. Normalization function and config.
-- ---------------------------------------------------------------------------
drop function if exists sf_id_18(text);

update portal_app_config
   set value = value - 'sf_auto_create' - 'sf_presale_bridge'
 where key = 'v2_flags';

delete from portal_app_config
 where key in ('integration.log_retention_days', 'sf_fallback_template');
