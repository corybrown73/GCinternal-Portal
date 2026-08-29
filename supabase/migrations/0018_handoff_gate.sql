-- 0018 — The handoff gate.
--
-- Design: docs/design/handoff-gate.md. The decision that shapes this schema:
-- the packet REFERENCES the live records rather than copying them. Success
-- measures, stakeholders, commitments, risks, the SOW and the Miro board all
-- already have homes; a packet that copied them would create a second source
-- of truth that diverges the moment someone edits the real record — and the
-- packet is exactly the artifact people would then trust.
--
-- So this table is thin: only the fields with no existing home, plus the
-- accept/return state. Completeness is COMPUTED from the live records and is
-- never stored as truth; the snapshot below is evidence of a decision, not a
-- second copy of the content.
--
-- Rollback: supabase/down/0018_down.sql

create table handoff_packets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  -- One packet per implementation: the handoff happens once, though it may be
  -- returned and resubmitted any number of times.
  implementation_id uuid not null unique references implementations (id) on delete cascade,

  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'accepted', 'returned')),

  -- The fields with no existing home. Everything else is referenced.
  integration_dependencies text,
  data_migration_needs text,
  roadmap_promises text,
  -- Recorded calls that are not Gong reports: [{label, url}]
  discovery_call_links jsonb not null default '[]',

  submitted_by uuid references portal_profiles (id) on delete set null,
  submitted_at timestamptz,
  decided_by uuid references portal_profiles (id) on delete set null,
  decided_at timestamptz,

  -- Which required items were missing when it was returned, plus the note.
  -- A free-text-only return is how this degrades into "not good enough".
  return_missing_keys text[] not null default '{}',
  return_note text,

  -- What the completeness check saw at the moment of the decision. Evidence of
  -- the decision, NOT a copy of the content — the live records stay the truth.
  decision_snapshot jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index handoff_packets_status_idx on handoff_packets (status);

create trigger handoff_packets_touch before update on handoff_packets
  for each row execute function portal_touch_updated_at();

-- Every submit, accept and return, in order. The packet row holds current
-- state; this holds how it got there — including a return that was later
-- resubmitted and accepted, which the packet row alone would lose.
create table handoff_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  packet_id uuid not null references handoff_packets (id) on delete cascade,
  implementation_id uuid not null references implementations (id) on delete cascade,
  kind text not null check (kind in ('submitted', 'accepted', 'returned', 'reopened')),
  actor_id uuid references portal_profiles (id) on delete set null,
  missing_keys text[] not null default '{}',
  note text,
  -- The completeness result at this moment, for the same reason as above.
  snapshot jsonb,
  created_at timestamptz not null default now()
);
create index handoff_events_packet_idx on handoff_events (packet_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Stakeholder facts that outlive any one handoff
-- ---------------------------------------------------------------------------
-- The brief calls out skeptics explicitly, and a stakeholder map that cannot
-- express dissent is decoration. Both of these are facts about a person, so
-- they belong on the contact rather than in the packet.
--
-- `if not exists` is load-bearing, not defensive noise: 0018's down deliberately
-- KEEPS these two columns (a recorded fact about a person did not come from the
-- gate and must not be erased by rolling it back), so a re-apply after a
-- rollback finds them already there. Without this, up -> down -> up fails.
alter table customer_contacts
  add column if not exists is_skeptic boolean not null default false,
  add column if not exists comms_preference text;

-- ---------------------------------------------------------------------------
-- RLS (defense-in-depth; the server functions are the real boundary)
-- ---------------------------------------------------------------------------
alter table handoff_packets enable row level security;
alter table handoff_events enable row level security;

-- Internal only. A handoff packet is an internal accountability artifact and
-- is never shown to a customer, so there is deliberately no customer policy.
create policy "handoff_packets internal" on handoff_packets
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "handoff_events internal" on handoff_events
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());

-- ---------------------------------------------------------------------------
-- Flag — off. The columns above are additive and inert until it flips.
-- ---------------------------------------------------------------------------
update portal_app_config
   set value = value || '{"handoff_gate": false}'::jsonb
 where key = 'v2_flags';
