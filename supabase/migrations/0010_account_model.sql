-- 0010 — Account model: accounts get a real Salesforce key, implementations get
-- parent/opportunity identity and the recorded-vs-computed health split, and
-- portal_profiles gains a bridge to team_members.
--
-- Additive only. Nothing existing changes meaning; `implementations.status`
-- is neither modified nor dropped — it stays the legacy read path and the
-- rollback safety net.
--
-- Rollback: supabase/down/0010_down.sql (see its header — it REQUIRES a
-- health_recorded export first, because those values are genuine human input).

-- ---------------------------------------------------------------------------
-- A. Account identity
-- ---------------------------------------------------------------------------
alter table customers
  add column salesforce_account_id text,
  add column csm_owner_id uuid references team_members (id) on delete set null;

create unique index customers_sf_account_idx
  on customers (salesforce_account_id)
  where salesforce_account_id is not null;

-- B. Backfill the SF account id from the linked presale deal. 0007's
-- portal_accounts.customer_id is the only trustworthy mapping; this copies an
-- external identifier (provenance = the FK link), not a human statement.
update customers c
   set salesforce_account_id = pa.salesforce_id
  from portal_accounts pa
 where pa.customer_id = c.id
   and pa.salesforce_id is not null
   and c.salesforce_account_id is null;

-- ---------------------------------------------------------------------------
-- C. Implementation identity + health
-- ---------------------------------------------------------------------------
-- NOTE: there is deliberately NO health_recorded backfill. `status` is written
-- programmatically (startOnboarding inserts 'on_track'; the DB default is
-- 'active') and nothing audits status edits, so no existing status value is
-- evidenced as a human statement. Copying one into a column defined as "the
-- human's statement" would launder a system default into recorded fact. The UI
-- reads `status` through as a clearly-labelled legacy flag instead.
alter table implementations
  add column parent_implementation_id uuid references implementations (id) on delete set null,
  add column salesforce_opportunity_id text,
  add column health_recorded text check (health_recorded in ('on_track', 'at_risk', 'blocked')),
  add column health_recorded_reason text,
  add column health_recorded_by uuid references team_members (id) on delete set null,
  add column health_recorded_at timestamptz,
  add column health_computed text
    check (health_computed in ('on_track', 'at_risk', 'blocked', 'no_signal')),
  add column health_computed_at timestamptz,
  add column health_computed_inputs jsonb;

create unique index implementations_sf_opportunity_idx
  on implementations (salesforce_opportunity_id)
  where salesforce_opportunity_id is not null;

create index implementations_parent_idx on implementations (parent_implementation_id);

-- ---------------------------------------------------------------------------
-- D. Single-level parent guard
-- ---------------------------------------------------------------------------
-- A child is a full first-class implementation; only the nesting depth is
-- constrained. Arbitrary depth is a schema-compatible relaxation for later.
create or replace function implementations_parent_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  parent_parent uuid;
begin
  if new.parent_implementation_id is null then
    return new;
  end if;

  if new.parent_implementation_id = new.id then
    raise exception 'An implementation cannot be its own parent';
  end if;

  -- Lock the intended parent first: without this, two concurrent updates can
  -- each see the other as parentless and form a 2-cycle under READ COMMITTED.
  select parent_implementation_id into parent_parent
    from implementations
   where id = new.parent_implementation_id
     for update;

  if not found then
    raise exception 'Parent implementation % does not exist', new.parent_implementation_id;
  end if;

  if parent_parent is not null then
    raise exception 'Implementation hierarchy is single-level: % already has a parent',
      new.parent_implementation_id;
  end if;

  if exists (select 1 from implementations where parent_implementation_id = new.id) then
    raise exception 'Implementation % has children and cannot also be a child', new.id;
  end if;

  return new;
end;
$$;

create trigger implementations_parent_guard_trg
  before insert or update of parent_implementation_id on implementations
  for each row execute function implementations_parent_guard();

-- ---------------------------------------------------------------------------
-- E. People-table bridge (PLAN.md decision 9: bridge, don't merge)
-- ---------------------------------------------------------------------------
-- 19 hub tables anchor ownership to team_members; auth lives in
-- portal_profiles, with no FK between them. New v2 ownership columns keep
-- pointing at team_members; this nullable bridge lets a signed-in user be
-- resolved to their hub identity. Backfilled by exact email match only.
alter table portal_profiles
  add column team_member_id uuid references team_members (id) on delete set null;

update portal_profiles p
   set team_member_id = t.id
  from team_members t
 where t.email is not null
   and lower(t.email) = lower(p.email)
   and p.team_member_id is null;

-- ---------------------------------------------------------------------------
-- F. Feature flag
-- ---------------------------------------------------------------------------
-- Schema above is inert until the flag turns on the workflow/UX changes.
-- Grant-scope enforcement (0011) is NOT gated by this flag — it is a security
-- invariant, not a feature.
insert into portal_app_config (key, value)
values ('v2_flags', '{"account_model": false}'::jsonb)
on conflict (key) do nothing;
