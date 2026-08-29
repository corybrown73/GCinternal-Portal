-- 0019 — External portal access: signed plan links.
--
-- Design: docs/design/portal-access.md (§2.1–§2.3, §2.6, §2.7), renumbered
-- 0009 -> 0019 per the ledger in docs/PLAN.md, and `share_slug` renamed to
-- `portal_key` per that same ledger.
--
-- NAMING-COLLISION CHECK (re-run in full, per the 0003 precedent).
-- This database is shared with an unrelated prototype app. Checked against the
-- complete 28-table prototype list recorded in the 0003 header — clients,
-- users, forms, submissions, submission_fields, reports, accounts, sessions,
-- verification_tokens, alert_rules, webhooks, shared_links, reference_tables,
-- reference_rows, invites, form_versions, dashboards, dashboard_tiles,
-- insight_items, routing_rules, solutions, proposals, price_book_items,
-- connectors, api_specs, proposal_views, deal_activities, proposal_snapshots —
-- plus every hub/portal table. New names here: external_access_grants,
-- external_plan_events. Result: NO collision. Near-misses recorded because a
-- future rename must re-check them: external_plan_events vs the hub's
-- journey_events (0014), and (0022) plan_snapshots vs the prototype's
-- proposal_snapshots. Distinct in both cases.
--
-- ENFORCEMENT NOTE. Every app read and write runs on the service-role client,
-- which bypasses RLS. The load-bearing authorization for the token door is
-- src/lib/server/external-viewer.ts, not these policies. RLS here is a wall for
-- the browser: anon gets nothing, customer sessions get nothing, and internal
-- sessions may READ grants but may never write one — a grant can only be minted
-- by the audited server function. Where a guarantee has to hold against the
-- service role itself, it is a TRIGGER (section F), because policies do not
-- apply to service_role.
--
-- Rollback: supabase/down/0019_down.sql (archives to v2_archive; deliberately
-- KEEPS implementations.portal_key — see that file for why, and note the
-- `if not exists` clauses below that make this migration re-appliable after it).

-- ---------------------------------------------------------------------------
-- A. Customer-facing key for an implementation
-- ---------------------------------------------------------------------------
-- Uuids must never appear in a URL an outsider sees. `portal_key` is an
-- identifier, NOT a credential: every route that takes one still authenticates.
--
-- hex, not base64: Postgres base64 emits '/' and '+', either of which breaks a
-- path segment. 18 hex chars = 72 bits.
--
-- The volatile default forces a full-table REWRITE under ACCESS EXCLUSIVE and
-- fills every existing row itself, so there is deliberately no backfill UPDATE
-- here. implementations holds hundreds of rows; the lock window is
-- milliseconds. Run off-peak anyway.
--
-- `if not exists` is load-bearing: 0019_down keeps this column (dropping it
-- would break every bookmarked /portal/plan URL, and re-adding it would mint
-- different keys), so a re-apply after a rollback finds it already present.
alter table implementations
  add column if not exists portal_key text not null unique
    default encode(gen_random_bytes(9), 'hex');

-- Customer logo for the plan page. Objects live in the PRIVATE
-- customer-branding bucket (section E) and are served via signed URLs.
alter table customers
  add column if not exists logo_path text;

-- ---------------------------------------------------------------------------
-- B. Contact dedupe + unique index
-- ---------------------------------------------------------------------------
-- "Reassign to a colleague" finds-or-creates a customer_contacts row by email.
-- That is only deterministic if (customer_id, email) is unique, which it is not
-- today. Duplicates are MERGED, never deleted blind: every row is archived with
-- the id it was merged into, and every foreign key pointing at a duplicate is
-- repointed at the survivor (the oldest row) first. The FK list is read from
-- the catalog rather than hardcoded, so a table added by another phase cannot
-- be silently missed.
do $$
declare
  fk record;
  dups int;
begin
  create temp table _cc_dedupe on commit drop as
    with ranked as (
      select id,
             first_value(id) over (
               partition by customer_id, lower(btrim(email))
               order by created_at, id
             ) as keep_id
        from customer_contacts
       where email is not null and btrim(email) <> ''
    )
    select id as dup_id, keep_id from ranked where id <> keep_id;

  select count(*) into dups from _cc_dedupe;
  if dups = 0 then
    return;
  end if;

  create schema if not exists v2_archive;
  create table if not exists v2_archive.customer_contacts_deduped (
    like customer_contacts,
    merged_into uuid,
    merged_at timestamptz
  );
  insert into v2_archive.customer_contacts_deduped
    select c.*, d.keep_id, now()
      from customer_contacts c
      join _cc_dedupe d on d.dup_id = c.id;

  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.customer_contacts'::regclass
       and array_length(c.conkey, 1) = 1
  loop
    execute format(
      'update %s t set %I = d.keep_id from _cc_dedupe d where t.%I = d.dup_id',
      fk.tbl, fk.col, fk.col
    );
  end loop;

  delete from customer_contacts c using _cc_dedupe d where c.id = d.dup_id;
  raise notice 'merged % duplicate contact(s) into v2_archive.customer_contacts_deduped', dups;
end $$;

-- Contacts with no email stay unconstrained: a name-only contact is a
-- legitimate record and there is nothing to dedupe it by.
create unique index if not exists customer_contacts_email_unique_idx
  on customer_contacts (customer_id, lower(btrim(email)))
  where email is not null and btrim(email) <> '';

-- ---------------------------------------------------------------------------
-- C. external_access_grants
-- ---------------------------------------------------------------------------
-- Hash-in-DB (the portal_api_keys pattern), not a stateless JWT: revocation,
-- lockout and telemetry all need the row anyway, so the row is the source of
-- truth. The raw token is never stored and never logged.
create table external_access_grants (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,
  -- Denormalized for scoping reads; the trigger below makes it impossible for
  -- it to disagree with the implementation's customer.
  customer_id       uuid not null references customers (id) on delete cascade,
  -- No ON DELETE action on purpose: offboarding a champion must REVOKE the
  -- grant, not quietly orphan a live one. The trigger in section F does that.
  contact_id        uuid references customer_contacts (id),
  email             text not null,
  token_hash        text not null unique,
  -- First 12 chars ("gcpl_ab12ef…") so the admin UI can name a link without
  -- ever holding the credential.
  token_prefix      text not null,
  can_complete      boolean not null default true,
  passcode_hash     text,
  passcode_attempts int not null default 0,
  locked_until      timestamptz,
  -- Immutable once issued (trigger). Renewing is always a rotation, so the row
  -- stays evidence of what was actually issued.
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  revoked_by        uuid references portal_profiles (id) on delete set null,
  revoke_reason     text check (revoke_reason in
                    ('manual','rotated','contact_removed','implementation_closed')),
  superseded_by     uuid references external_access_grants (id) on delete set null,
  -- Set by reassign. The expiry-inheritance chain: a reassigned grant copies
  -- its parent's expires_at, so a chain of reassignments can never outlive the
  -- original issuance.
  parent_grant_id   uuid references external_access_grants (id) on delete set null,
  created_by        uuid references portal_profiles (id) on delete set null,
  created_via       text not null default 'internal'
                    check (created_via in ('internal','reassign')),
  created_at        timestamptz not null default now(),
  last_opened_at    timestamptz,
  open_count        int not null default 0
);

create index eag_impl_idx on external_access_grants (implementation_id);
create index eag_contact_idx on external_access_grants (contact_id);
create index eag_customer_idx on external_access_grants (customer_id);

alter table external_access_grants enable row level security;

-- Internal staff may READ grants (the share panel lists them). There is
-- deliberately no insert/update/delete policy for ANY role: no browser
-- session — sales, tam_se, admin, anyone — can mint or alter a grant with a
-- token hash whose preimage they chose. Issuance goes through the audited
-- server function, which is gated app-side.
create policy "eag internal select" on external_access_grants
  for select to authenticated using (portal_is_internal());

-- ---------------------------------------------------------------------------
-- D. external_plan_events — append-only evidence of external activity
-- ---------------------------------------------------------------------------
create table external_plan_events (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  grant_id          uuid references external_access_grants (id) on delete cascade,
  implementation_id uuid not null references implementations (id) on delete cascade,
  contact_id        uuid references customer_contacts (id) on delete set null,
  -- The auth door (a /portal login) records here too, so one table answers
  -- "what did the customer do" regardless of which door they came through.
  profile_id        uuid references portal_profiles (id) on delete set null,
  event             text not null check (event in
                    ('opened','task_completed','task_reopened','comment_added',
                     'file_uploaded','task_reassigned','snapshot_viewed',
                     'passcode_failed','grant_revoked','grant_rotated')),
  -- Work-item reference and user-agent family. No raw IP addresses.
  metadata          jsonb,
  created_at        timestamptz not null default now()
);

create index epe_impl_time_idx on external_plan_events (implementation_id, created_at desc);
create index epe_grant_idx on external_plan_events (grant_id, event, created_at desc);

alter table external_plan_events enable row level security;

-- Internal SELECT only. No write policy for any browser role: engagement
-- history is evidence and cannot be forged from a browser session.
create policy "epe internal select" on external_plan_events
  for select to authenticated using (portal_is_internal());

-- ---------------------------------------------------------------------------
-- E. Storage buckets
-- ---------------------------------------------------------------------------
-- Follows the real 0001 precedent (0001:378 inserts portal-briefs and
-- portal-uploads) — buckets are provisioned in SQL, private, and the server
-- signs a URL for every download.
--
-- 'attachments' is provisioned NOWHERE in this repo today even though
-- src/lib/hub.server.ts already writes to it; it is created here, idempotently,
-- so a fresh environment matches production.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false),
       ('customer-branding', 'customer-branding', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- F. Triggers — the guarantees that must hold against the service role
-- ---------------------------------------------------------------------------
-- RLS does not apply to service_role, and every app write is service_role, so
-- anything that must be true of a grant row no matter what the app does has to
-- be a trigger.
create or replace function eag_enforce()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  impl_customer uuid;
begin
  if tg_op = 'INSERT' then
    select customer_id into impl_customer
      from implementations where id = new.implementation_id;
    if impl_customer is null then
      raise exception 'external_access_grants: implementation % does not exist',
        new.implementation_id;
    end if;
    if new.customer_id <> impl_customer then
      raise exception 'external_access_grants: customer_id % is not the customer of implementation %',
        new.customer_id, new.implementation_id;
    end if;
    if new.expires_at <= new.created_at then
      raise exception 'external_access_grants: expires_at must be in the future';
    end if;
    return new;
  end if;

  -- What was issued is evidence. Renewal is rotation, never mutation.
  if new.token_hash is distinct from old.token_hash then
    raise exception 'external_access_grants.token_hash is immutable; rotate instead';
  end if;
  if new.expires_at is distinct from old.expires_at then
    raise exception 'external_access_grants.expires_at is immutable; rotate instead';
  end if;
  if new.implementation_id is distinct from old.implementation_id then
    raise exception 'external_access_grants.implementation_id is immutable';
  end if;
  if new.customer_id is distinct from old.customer_id then
    raise exception 'external_access_grants.customer_id is immutable';
  end if;
  return new;
end $$;

drop trigger if exists eag_enforce_trg on external_access_grants;
create trigger eag_enforce_trg
  before insert or update on external_access_grants
  for each row execute function eag_enforce();

-- Contact offboarded -> their live links stop working, immediately, without
-- anyone having to remember. contact_id is cleared on every grant of that
-- contact (not just the live ones) because the column has no ON DELETE action:
-- clearing it is what lets the delete proceed at all.
create or replace function revoke_grants_for_contact()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update external_access_grants
     set revoked_at = now(),
         revoke_reason = 'contact_removed'
   where contact_id = old.id and revoked_at is null;
  update external_access_grants
     set contact_id = null
   where contact_id = old.id;
  return old;
end $$;

drop trigger if exists cc_revoke_grants_trg on customer_contacts;
create trigger cc_revoke_grants_trg
  before delete on customer_contacts
  for each row execute function revoke_grants_for_contact();

-- Implementation reaches its terminal stage -> external access ends.
--
-- Terminal is defined by STAGE, not status: `implementations.status` has no
-- check constraint and no closed/churned value in the app's vocabulary
-- (src/lib/implementation-input.ts: on_track|at_risk|blocked|idle, plus the
-- legacy DB default 'active'), so status cannot express "closed". The
-- lifecycle's terminal stage is graduate-to-cs, with its two recorded legacy
-- aliases (src/lib/lifecycle.ts STAGE_ALIASES).
create or replace function revoke_grants_for_implementation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update external_access_grants
     set revoked_at = now(),
         revoke_reason = 'implementation_closed'
   where implementation_id = new.id and revoked_at is null;

  -- Live snapshot shares for this implementation expire with it. Guarded by
  -- to_regclass so this migration does not depend on 0022 having run.
  if to_regclass('public.plan_snapshots') is not null then
    execute 'update plan_snapshots set share_revoked_at = now()
              where implementation_id = $1
                and share_token_hash is not null
                and share_revoked_at is null'
      using new.id;
  end if;
  return new;
end $$;

drop trigger if exists impl_close_revokes_grants_trg on implementations;
create trigger impl_close_revokes_grants_trg
  after update of current_stage on implementations
  for each row
  when (
    new.current_stage in ('graduate-to-cs', 'graduate', 'cs')
    and old.current_stage is distinct from new.current_stage
  )
  execute function revoke_grants_for_implementation();

-- ---------------------------------------------------------------------------
-- G. Closing the auth door's column leak
-- ---------------------------------------------------------------------------
-- The design's most serious finding (mustFix 3), and it belongs with the phase
-- that opens the first outward-facing surface: 0005's customer-select policies
-- on `customers` and `implementations` are FULL-ROW. A customer-auth session
-- holding the publishable key could PostgREST-read, directly and without going
-- anywhere near loadSharedPlan:
--   customers.arr, customers.segment
--   implementations.sow_value, sow_document_url, sow_document_name,
--     discovery_board_url, discovery_board_notes, customer_goals, tier, status
-- The whole point of the projection layer is that a field is either
-- customer-safe or unreachable; a full-row policy under it makes that untrue.
--
-- VERIFIED BEHAVIOR-NEUTRAL before dropping them. Every /portal read runs
-- through server functions on the service-role client
-- (portal.functions.ts -> portal.server.ts:loadPortalHome), which RLS does not
-- constrain. Pre-ship grep, recorded here as evidence: the browser client
-- (src/integrations/supabase/client.ts) is imported by exactly five modules —
-- auth.ts, login, signup, auth.callback, forgot-password — and the only table
-- any of them reads is portal_profiles (auth.ts:78). There is no browser-client
-- read of customers or implementations anywhere in src/.
--
-- COLUMN AUDIT of the customer-select policies that are KEPT, one by one:
--   customer_contacts  — id, customer_id, name, email, role, notes,
--                        is_skeptic, comms_preference. `notes` and
--                        `is_skeptic` are internal assessments of a person.
--                        FLAGGED, not dropped here: /portal's contact list
--                        reads through server functions, but narrowing this
--                        policy is a change to the authenticated portal's
--                        surface rather than to Phase 4's, and it needs its own
--                        migration and its own staging pass. Recorded as an
--                        open item in the phase report.
--   milestones         — name, status, target_date, completed_date, stage,
--                        owner_id. Customer-safe.
--   commitments        — description, due_date, committed_to, fulfilled_at.
--                        Customer-safe (they are our promises to them).
--   success_criteria   — description, metric, baseline/measured values.
--                        Customer-safe; these are jointly agreed measures.
--   tickets / ticket_comments — already scoped, and ticket_comments excludes
--                        internal notes in its own policy (0006/0011).
--
-- `if exists` on both drops, and 0019_down recreates them verbatim, so
-- up -> down -> up is clean in both directions.
drop policy if exists "customers customer select" on customers;
drop policy if exists "implementations customer select" on implementations;

-- ---------------------------------------------------------------------------
-- H. Config + flags
-- ---------------------------------------------------------------------------
-- `do nothing` rather than `do update`: re-applying this migration must not
-- reset a TTL an operator has since tuned.
insert into portal_app_config (key, value)
values ('external_plan_link_ttl_days', '60'::jsonb),
       ('external_plan_reassign_daily_limit', '10'::jsonb),
       ('snapshot_share_ttl_days', '30'::jsonb)
on conflict (key) do nothing;

-- Both flags OFF. The view flag gates the read surface; the actions flag gates
-- every mutation. They are UX/rollout gates only — never an authorization
-- decision (the 60s flag cache propagates unevenly; see app-config.server.ts).
update portal_app_config
   set value = value || '{"external_plan_view_enabled": false, "external_plan_actions_enabled": false}'::jsonb
 where key = 'v2_flags';
