-- 0050 — who gets the account: the pool and the record of assignments
--
-- WHAT THIS IS FOR. The minute a deal closes, somebody in implementation
-- should have eyes on it — not "the team", a person, with the three things
-- they do first. The pick is a weighted round robin: every closed-won deal
-- carries a weight (seats, ARR, an integration tier), each person in the
-- pool carries the weight of what they were handed recently, and the next
-- account goes to whoever is carrying the least. The person who just took
-- the heavy integration is skipped on the next small one until the others
-- catch up. The rules that turn a deal into a weight live in
-- portal_app_config under `assignment_rules`, so a manager tunes them
-- without a deploy.
--
-- TWO TABLES. The pool is who is in rotation (team_members, because that is
-- what implementations.owner_id points at and where the email lives). The
-- assignments table is the ledger: every pick, its weight and why, whether
-- a rule or a person made it. Load is computed from the ledger over a
-- window, never stored, so changing the window re-balances the past too.

create table portal_assignment_pool (
  team_member_id uuid primary key references team_members(id) on delete cascade,
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  active boolean not null default true,
  -- A person can carry more or less than one share: 0.5 for a half-time
  -- specialist, 2 for a lead who takes the complex ones. Load is divided by it.
  capacity numeric(4,2) not null default 1.0 check (capacity > 0 and capacity <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table portal_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  deal_id uuid not null references portal_accounts(id) on delete cascade,
  implementation_id uuid references implementations(id) on delete set null,
  team_member_id uuid not null references team_members(id) on delete cascade,
  -- The weight this deal counted for, and how it was arrived at.
  weight integer not null check (weight >= 0),
  breakdown jsonb not null default '{}'::jsonb,
  -- 'auto' is the rule; 'manual' is a person overriding it.
  source text not null check (source in ('auto','manual')),
  actor_profile_id uuid references portal_profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  constraint portal_assignments_breakdown_is_object check (jsonb_typeof(breakdown) = 'object')
);

create index portal_assignments_member_recent_idx
  on portal_assignments (team_member_id, created_at desc);
create index portal_assignments_deal_idx on portal_assignments (deal_id, created_at desc);

alter table portal_assignment_pool enable row level security;
alter table portal_assignments enable row level security;
create policy "assignment_pool internal" on portal_assignment_pool
  for all using (portal_is_internal()) with check (portal_is_internal());
create policy "assignments internal" on portal_assignments
  for all using (portal_is_internal()) with check (portal_is_internal());

comment on table portal_assignment_pool is
  'Who is in rotation for new accounts. Load is computed from portal_assignments, not stored.';
comment on table portal_assignments is
  'The ledger of who was handed which account, at what weight, and whether a rule or a person decided.';
