-- 0023 — Salesforce integration.
--
-- Phase 1 (0010) already added `customers.salesforce_account_id` and
-- `implementations.salesforce_opportunity_id`. This migration CONSUMES those
-- columns and adds only what Phase 5 needs on top of them:
--
--   A. sf_id_18() — the 15→18 normalization that makes the key a key, plus a
--      one-time, audited data fix over the ids already stored.
--   B. Supersession: a pointer, an evidence column, and the partial unique
--      index that lets a re-won opportunity have a follow-on WITHOUT ever
--      producing two current implementations for one opportunity.
--   C. sf_supersede_implementation() — the human-driven RPC. Never automatic.
--   D. sf_create_implementation() — the ingest's create step, in ONE
--      transaction, so a lost race leaves no orphan.
--   E. The integration tables: outbox, sync log, field maps, webhooks.
--   F. Seeds, all dark.
--
-- Everything is additive and lands behind `sf_auto_create` / `sf_presale_bridge`,
-- both false. Rollback: supabase/down/0023_down.sql — it ARCHIVES the sync log,
-- the outbox and the delivery history to v2_archive rather than destroying
-- them, because those rows are the evidence behind every SF-created record.

-- ---------------------------------------------------------------------------
-- A. Salesforce id normalization
-- ---------------------------------------------------------------------------
-- The 18-character form appends a 3-character checksum of the case pattern of
-- the first 15 characters. Identity is deterministic in one direction only, so
-- normalization is always 15 → 18 and never the reverse. Anything that is not
-- a well-formed 15-character id is returned unchanged: this function never
-- invents an identity.
--
-- The TypeScript twin is `sfId18()` in src/lib/server/sf-id.ts; the shared
-- algorithm is pinned by src/lib/__tests__/sf-id.test.ts.
create or replace function sf_id_18(p_id text)
returns text
language plpgsql
immutable
as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  chunk int;
  i int;
  bits int;
  c text;
  suffix text := '';
begin
  if p_id is null then return null; end if;
  if length(p_id) <> 15 then return p_id; end if;
  if p_id !~ '^[a-zA-Z0-9]{15}$' then return p_id; end if;

  for chunk in 0..2 loop
    bits := 0;
    for i in 0..4 loop
      c := substr(p_id, chunk * 5 + i + 1, 1);
      if c ~ '^[A-Z]$' then
        bits := bits + (1 << i);
      end if;
    end loop;
    suffix := suffix || substr(alphabet, bits + 1, 1);
  end loop;

  return p_id || suffix;
end;
$$;

-- ---------------------------------------------------------------------------
-- B. Supersession identity on implementations
-- ---------------------------------------------------------------------------
alter table implementations
  add column if not exists salesforce_account_id text,
  add column if not exists sf_closed_won_at timestamptz,
  add column if not exists superseded_by_implementation_id uuid
    references implementations (id) on delete set null;

comment on column implementations.sf_closed_won_at is
  'What Salesforce SAYS about when this deal closed. Recorded from the payload, never derived from hub state.';
comment on column implementations.superseded_by_implementation_id is
  'Set only by sf_supersede_implementation(). A superseded row keeps its opportunity id as history and leaves the current-opportunity unique index.';

-- 0010's index is unique across ALL rows with an opportunity id, which makes a
-- follow-on implementation for a re-won opportunity impossible to represent.
-- It is replaced by the same guarantee scoped to CURRENT rows. 0023_down
-- restores 0010's exact index, so this drop is reversible.
drop index if exists implementations_sf_opportunity_idx;

create unique index if not exists implementations_sf_opp_current_uidx
  on implementations (org_id, salesforce_opportunity_id)
  where salesforce_opportunity_id is not null
    and superseded_by_implementation_id is null;

create index if not exists implementations_sf_opp_idx
  on implementations (salesforce_opportunity_id)
  where salesforce_opportunity_id is not null;

create index if not exists implementations_superseded_by_idx
  on implementations (superseded_by_implementation_id)
  where superseded_by_implementation_id is not null;

-- A real DB-level guarantee, not an RLS policy: every app write runs on the
-- service role, which bypasses RLS entirely, so the only place this can be
-- enforced for certain is a trigger.
--   1. An opportunity id, once recorded, is evidence: it may be set once and
--      cleared, but never silently re-pointed at a different opportunity.
--   2. Supersession is append-only: a superseded row can never be un-superseded,
--      which would resurrect a second current row for one opportunity.
create or replace function implementations_sf_identity_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.salesforce_opportunity_id is not null
       and new.salesforce_opportunity_id is not null
       and new.salesforce_opportunity_id <> old.salesforce_opportunity_id then
      raise exception
        'implementation % is already recorded against opportunity %; an opportunity id cannot be repointed',
        old.id, old.salesforce_opportunity_id;
    end if;

    if old.superseded_by_implementation_id is not null
       and new.superseded_by_implementation_id is distinct from old.superseded_by_implementation_id then
      raise exception
        'implementation % was superseded by %; supersession is append-only',
        old.id, old.superseded_by_implementation_id;
    end if;
  end if;

  if new.superseded_by_implementation_id = new.id then
    raise exception 'an implementation cannot supersede itself';
  end if;

  return new;
end;
$$;

drop trigger if exists implementations_sf_identity_guard_trg on implementations;
create trigger implementations_sf_identity_guard_trg
  before insert or update on implementations
  for each row execute function implementations_sf_identity_guard();

-- ---------------------------------------------------------------------------
-- A2. One-time data fix: normalize the ids already stored.
-- ---------------------------------------------------------------------------
-- The originals are written to portal_audit_log FIRST, so the value a person or
-- an import actually recorded survives the rewrite as evidence. Rows whose
-- normalized form would collide with an existing row are left alone and
-- reported instead — a silent merge of two identities is the one outcome worse
-- than an unnormalized id.
do $$
declare
  fixed int := 0;
  skipped int := 0;
  r record;
begin
  for r in
    select id, salesforce_id as old_id, sf_id_18(salesforce_id) as new_id
      from portal_accounts
     where salesforce_id is not null
       and length(salesforce_id) = 15
  loop
    if exists (select 1 from portal_accounts where salesforce_id = r.new_id) then
      skipped := skipped + 1;
      insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
      values ('system', 'account.sf_id_normalize_skipped', 'account', r.id,
              jsonb_build_object('from', r.old_id, 'to', r.new_id,
                                 'reason', 'the normalized id is already held by another account'));
      continue;
    end if;
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'account.sf_id_normalized', 'account', r.id,
            jsonb_build_object('from', r.old_id, 'to', r.new_id));
    update portal_accounts set salesforce_id = r.new_id where id = r.id;
    fixed := fixed + 1;
  end loop;

  for r in
    select id, salesforce_account_id as old_id, sf_id_18(salesforce_account_id) as new_id
      from customers
     where salesforce_account_id is not null
       and length(salesforce_account_id) = 15
  loop
    if exists (select 1 from customers where salesforce_account_id = r.new_id) then
      skipped := skipped + 1;
      insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
      values ('system', 'customer.sf_id_normalize_skipped', 'customer', r.id,
              jsonb_build_object('from', r.old_id, 'to', r.new_id,
                                 'reason', 'the normalized id is already held by another customer'));
      continue;
    end if;
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'customer.sf_id_normalized', 'customer', r.id,
            jsonb_build_object('from', r.old_id, 'to', r.new_id));
    update customers set salesforce_account_id = r.new_id where id = r.id;
    fixed := fixed + 1;
  end loop;

  for r in
    select id, salesforce_opportunity_id as old_id, sf_id_18(salesforce_opportunity_id) as new_id
      from implementations
     where salesforce_opportunity_id is not null
       and length(salesforce_opportunity_id) = 15
  loop
    if exists (select 1 from implementations
                where salesforce_opportunity_id = r.new_id
                  and superseded_by_implementation_id is null) then
      skipped := skipped + 1;
      insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
      values ('system', 'implementation.sf_id_normalize_skipped', 'implementation', r.id,
              jsonb_build_object('from', r.old_id, 'to', r.new_id,
                                 'reason', 'the normalized id is already held by a current implementation'));
      continue;
    end if;
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'implementation.sf_id_normalized', 'implementation', r.id,
            jsonb_build_object('from', r.old_id, 'to', r.new_id));
    update implementations set salesforce_opportunity_id = r.new_id where id = r.id;
    fixed := fixed + 1;
  end loop;

  if fixed > 0 or skipped > 0 then
    raise notice 'sf id normalization: % rewritten, % skipped for collision', fixed, skipped;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- C. Supersede: a Postgres RPC, because REST has no transactions
-- ---------------------------------------------------------------------------
-- The partial unique index is checked per statement and is not deferrable, so
-- the ordering below is the only one that works: the new row is inserted
-- WITHOUT the opportunity id (it is not in the index yet), the old row is then
-- marked superseded (it leaves the index), and only then does the new row take
-- the opportunity id (the slot is free). One transaction; a failure at any
-- point leaves nothing behind.
--
-- Called ONLY from the explicit "create a follow-on implementation" action a
-- manager drives. Nothing automatic ever calls it.
create or replace function sf_supersede_implementation(
  p_old_implementation_id uuid,
  p_new_implementation jsonb,
  p_reason text,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  old_row implementations%rowtype;
  new_id uuid;
  actor_tm uuid;
  first_stage text;
  now_ts timestamptz := now();
begin
  if not (auth.role() = 'service_role' or portal_can_manage()) then
    raise exception 'forbidden';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to supersede an implementation';
  end if;

  select * into old_row from implementations where id = p_old_implementation_id for update;
  if not found then
    raise exception 'Implementation % does not exist', p_old_implementation_id;
  end if;
  if old_row.salesforce_opportunity_id is null then
    raise exception 'Implementation % has no Salesforce opportunity to carry forward',
      p_old_implementation_id;
  end if;
  if old_row.superseded_by_implementation_id is not null then
    raise exception 'Implementation % is already superseded by %',
      p_old_implementation_id, old_row.superseded_by_implementation_id;
  end if;

  select team_member_id into actor_tm from portal_profiles where id = p_actor_profile_id;
  first_stage := coalesce(p_new_implementation ->> 'current_stage', 'handoff');

  -- 1. The new row, WITHOUT the opportunity id.
  insert into implementations (
    customer_id, name, current_stage, stage_entered_at, status, source,
    owner_id, sales_owner, salesforce_account_id, sf_closed_won_at,
    target_launch_date, sow_value, parent_implementation_id
  )
  values (
    coalesce((p_new_implementation ->> 'customer_id')::uuid, old_row.customer_id),
    coalesce(p_new_implementation ->> 'name', old_row.name || ' (follow-on)'),
    first_stage,
    now_ts,
    coalesce(p_new_implementation ->> 'status', 'on_track'),
    coalesce(p_new_implementation ->> 'source', 'salesforce'),
    coalesce((p_new_implementation ->> 'owner_id')::uuid, old_row.owner_id),
    coalesce(p_new_implementation ->> 'sales_owner', old_row.sales_owner),
    coalesce(p_new_implementation ->> 'salesforce_account_id', old_row.salesforce_account_id),
    nullif(p_new_implementation ->> 'sf_closed_won_at', '')::timestamptz,
    nullif(p_new_implementation ->> 'target_launch_date', '')::date,
    nullif(p_new_implementation ->> 'sow_value', '')::numeric,
    null
  )
  returning id into new_id;

  -- 2. The old row leaves the current-opportunity index.
  update implementations
     set superseded_by_implementation_id = new_id,
         updated_at = now_ts
   where id = p_old_implementation_id;

  -- 3. The slot is free; the new row takes the opportunity id.
  update implementations
     set salesforce_opportunity_id = old_row.salesforce_opportunity_id,
         updated_at = now_ts
   where id = new_id;

  -- 4. The append-only stage history opens with the new implementation.
  insert into implementation_stage_history (implementation_id, stage, entered_at, entered_by, notes)
  values (new_id, first_stage, now_ts, actor_tm,
          'Follow-on implementation created by supersede: ' || p_reason);

  -- 5. Who did this, to what, and why.
  insert into portal_audit_log (actor_type, actor_id, action, entity_type, entity_id, payload)
  values (
    case when p_actor_profile_id is null then 'system' else 'user' end,
    p_actor_profile_id,
    'implementation.superseded',
    'implementation',
    p_old_implementation_id,
    jsonb_build_object(
      'old_implementation_id', p_old_implementation_id,
      'new_implementation_id', new_id,
      'salesforce_opportunity_id', old_row.salesforce_opportunity_id,
      'reason', p_reason
    )
  );

  return new_id;
end;
$$;

revoke execute on function sf_supersede_implementation(uuid, jsonb, text, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- D. The ingest's create step, atomic
-- ---------------------------------------------------------------------------
-- supabase-js speaks REST: two statements are two transactions. If the row were
-- inserted first and stamped with the opportunity id second, two concurrent
-- deliveries of the same closed-won payload would both create an implementation
-- and only one would fail the stamp — leaving an orphan implementation with a
-- fully instantiated plan and no opportunity.
--
-- Inside this function it is one transaction: on a 23505 the whole thing,
-- including the template instantiation, rolls back and the caller replays the
-- winner. That is why the ingest calls an RPC here rather than two writes.
create or replace function sf_create_implementation(
  p_customer_id uuid,
  p_patch jsonb,
  p_template_id uuid,
  p_opportunity_id text,
  p_account_id text,
  p_closed_won_at timestamptz,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  impl_id uuid;
  actor_tm uuid;
  now_ts timestamptz := now();
  first_stage text := coalesce(p_patch ->> 'current_stage', 'handoff');
begin
  if auth.role() is distinct from 'service_role' and not portal_can_manage() then
    raise exception 'forbidden';
  end if;

  if p_template_id is not null then
    -- Reuse Phase 2's instantiation verbatim: it creates the implementation,
    -- its stage instances, work items and dependencies, pinned to the exact
    -- template version. Duplicating any of that here would guarantee drift.
    impl_id := instantiate_journey(
      p_customer_id,
      p_patch || jsonb_build_object('source', 'salesforce'),
      p_template_id,
      '{}'::jsonb,
      '{}'::jsonb,
      p_actor_profile_id
    );
  else
    select team_member_id into actor_tm from portal_profiles where id = p_actor_profile_id;

    insert into implementations (
      customer_id, name, current_stage, stage_entered_at, status, source,
      owner_id, sales_owner, target_launch_date, sow_value
    )
    values (
      p_customer_id,
      coalesce(p_patch ->> 'name', 'Salesforce opportunity'),
      first_stage,
      now_ts,
      coalesce(p_patch ->> 'status', 'on_track'),
      'salesforce',
      nullif(p_patch ->> 'owner_id', '')::uuid,
      p_patch ->> 'sales_owner',
      nullif(p_patch ->> 'target_launch_date', '')::date,
      nullif(p_patch ->> 'sow_value', '')::numeric
    )
    returning id into impl_id;

    insert into implementation_stage_history (implementation_id, stage, entered_at, entered_by)
    values (impl_id, first_stage, now_ts, actor_tm);
  end if;

  -- The stamp that claims the opportunity. A unique violation here aborts the
  -- whole transaction, including everything above.
  update implementations
     set salesforce_opportunity_id = p_opportunity_id,
         salesforce_account_id = p_account_id,
         sf_closed_won_at = p_closed_won_at
   where id = impl_id;

  return impl_id;
end;
$$;

revoke execute on function sf_create_implementation(uuid, jsonb, uuid, text, text, timestamptz, uuid)
  from public, anon;

-- ---------------------------------------------------------------------------
-- E1. Event outbox
-- ---------------------------------------------------------------------------
create table if not exists integration_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  implementation_id uuid references implementations (id) on delete set null,
  payload jsonb not null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);

create index if not exists integration_events_undispatched_idx
  on integration_events (created_at)
  where dispatched_at is null;

-- Race-proof: a read-then-insert loses to two simultaneous Zapier retries.
create unique index if not exists integration_events_dedupe_uidx
  on integration_events (org_id, dedupe_key)
  where dedupe_key is not null and dispatched_at is null;

-- ---------------------------------------------------------------------------
-- E2. Sync log — the cross-system exchange record
-- ---------------------------------------------------------------------------
-- Three audit surfaces coexist and each has one job:
--   audit_log            — field-level changes to customer data
--   portal_audit_log     — actor-level actions
--   integration_sync_log — exchanges with another system (this table)
create table if not exists integration_sync_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'salesforce',
  kind text not null,
  external_id text,
  implementation_id uuid references implementations (id) on delete set null,
  customer_id uuid references customers (id) on delete set null,
  api_key_id uuid references portal_api_keys (id),
  idempotency_key text,
  request_hash text,
  request_payload jsonb,
  -- Which branch of the idempotency matrix ran, every template rule that was
  -- evaluated, the drift report, the adopted-customer evidence and the emails
  -- that did not resolve. Computed choices carry their inputs here.
  decision jsonb,
  response_status int,
  response_payload jsonb,
  status text not null check (status in ('succeeded', 'replayed', 'rejected', 'failed')),
  error text,
  retried_from_id uuid references integration_sync_log (id),
  created_at timestamptz not null default now()
);

create index if not exists integration_sync_log_ext_idx
  on integration_sync_log (external_id, created_at desc);
create index if not exists integration_sync_log_status_idx
  on integration_sync_log (status, created_at desc)
  where status in ('rejected', 'failed');
create index if not exists integration_sync_log_idempotency_idx
  on integration_sync_log (idempotency_key, created_at desc)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- E3. Field maps
-- ---------------------------------------------------------------------------
-- NOT `field_mappings` — 0003 already took that name for per-implementation
-- customer data mapping, which is a different thing entirely.
create table if not exists integration_field_maps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  provider text not null default 'salesforce',
  direction text not null check (direction in ('inbound', 'outbound')),
  source_path text not null,
  target_field text not null,
  transform text check (transform in ('none', 'date', 'number', 'stage_label', 'lowercase')),
  -- A blank a human left is recorded state. Filling it on a replay months later
  -- is opt-in, per field, and every fill is audited and journalled.
  fill_policy text not null default 'never' check (fill_policy in ('never', 'if_blank')),
  required boolean not null default false,
  active boolean not null default true,
  notes text,
  updated_by uuid references portal_profiles (id),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, direction, source_path, target_field)
);

-- ---------------------------------------------------------------------------
-- E4. Webhook endpoints, secrets and deliveries
-- ---------------------------------------------------------------------------
create table if not exists webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  name text not null,
  url text not null,
  secret_last4 text not null,
  event_types text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text
);

-- Service-role-ONLY by construction. RLS on, ZERO policies: no PostgREST
-- principal can read it, managers included — and customer-portal users hold the
-- `authenticated` role too, via magic link. Excluding a column from a select
-- list is not a security boundary, and a default (owner-rights) view would
-- bypass RLS for everyone; neither is used here. If a view is ever added it
-- MUST be `with (security_invoker = true)` plus explicit narrow grants.
create table if not exists webhook_endpoint_secrets (
  endpoint_id uuid primary key references webhook_endpoints (id) on delete cascade,
  secret_ciphertext text not null,
  created_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  endpoint_id uuid not null references webhook_endpoints (id) on delete cascade,
  event_id uuid not null references integration_events (id) on delete cascade,
  attempt int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'exhausted', 'skipped')),
  request_body jsonb not null,
  response_status int,
  response_body text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (endpoint_id, event_id)
);

create index if not exists webhook_deliveries_due_idx
  on webhook_deliveries (next_attempt_at)
  where status in ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- E5. RLS — defense in depth only
-- ---------------------------------------------------------------------------
-- Every app read and write runs on the service role, which bypasses RLS
-- entirely; authorization lives in app code. These policies exist so that a
-- leaked anon/authenticated key cannot read integration data through PostgREST,
-- matching the portal_api_keys posture (manage-select, no write policies).
alter table integration_events enable row level security;
alter table integration_sync_log enable row level security;
alter table integration_field_maps enable row level security;
alter table webhook_endpoints enable row level security;
alter table webhook_deliveries enable row level security;
alter table webhook_endpoint_secrets enable row level security;

drop policy if exists "integration_events manage select" on integration_events;
create policy "integration_events manage select" on integration_events
  for select using (portal_can_manage());

drop policy if exists "integration_sync_log manage select" on integration_sync_log;
create policy "integration_sync_log manage select" on integration_sync_log
  for select using (portal_can_manage());

drop policy if exists "integration_field_maps manage select" on integration_field_maps;
create policy "integration_field_maps manage select" on integration_field_maps
  for select using (portal_can_manage());

drop policy if exists "webhook_endpoints manage select" on webhook_endpoints;
create policy "webhook_endpoints manage select" on webhook_endpoints
  for select using (portal_can_manage());

drop policy if exists "webhook_deliveries manage select" on webhook_deliveries;
create policy "webhook_deliveries manage select" on webhook_deliveries
  for select using (portal_can_manage());

-- webhook_endpoint_secrets deliberately gets NO policy at all.

-- ---------------------------------------------------------------------------
-- F. Seeds — all dark
-- ---------------------------------------------------------------------------
-- Both flags ship false. Existing values win over these defaults, so
-- re-applying this migration after its own rollback never flips a live flag.
insert into portal_app_config (key, value)
values ('v2_flags', '{"sf_auto_create": false, "sf_presale_bridge": false}'::jsonb)
on conflict (key) do update
  set value = '{"sf_auto_create": false, "sf_presale_bridge": false}'::jsonb
              || portal_app_config.value;

insert into portal_app_config (key, value)
values
  ('integration.log_retention_days', '90'::jsonb),
  ('sf_fallback_template', '"none"'::jsonb)
on conflict (key) do nothing;

-- Seed maps carry notes = 'seed:0023' so the rollback can delete exactly the
-- rows nobody has edited. The field-map editor clears `notes` on save (see
-- saveFieldMap in src/lib/sf-integration.server.ts), so an edited row keeps
-- itself out of that delete through an explicit code path, not an assumption.
insert into integration_field_maps
  (direction, source_path, target_field, transform, fill_policy, required, notes)
values
  ('outbound', 'current_stage',       'GCHub_Stage__c',         'stage_label', 'never', false, 'seed:0023'),
  ('outbound', 'health_computed',     'GCHub_Health__c',        'none',        'never', false, 'seed:0023'),
  ('outbound', 'target_launch_date',  'GCHub_Target_Launch__c', 'date',        'never', false, 'seed:0023'),
  ('outbound', 'actual_launch_date',  'GCHub_Actual_Launch__c', 'date',        'never', false, 'seed:0023'),
  ('outbound', 'portal_url',          'GCHub_Portal_Link__c',   'none',        'never', false, 'seed:0023'),
  ('inbound',  'opportunity_name',    'name',                   'none',        'never', true,  'seed:0023'),
  ('inbound',  'close_date',          'target_launch_date',     'date',        'never', false, 'seed:0023'),
  ('inbound',  'amount',              'sow_value',              'number',      'never', false, 'seed:0023'),
  ('inbound',  'owner_email',         'sales_owner',            'lowercase',   'never', false, 'seed:0023')
on conflict (org_id, provider, direction, source_path, target_field) do nothing;
