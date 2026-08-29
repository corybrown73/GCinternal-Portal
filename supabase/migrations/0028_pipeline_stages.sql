-- 0028 — The pre-sale pipeline becomes configurable.
--
-- Design: docs/design/presale-stages.md.
--
-- The pre-sale motion is a Postgres enum (0001:8), which is the one shape you
-- cannot customise without a migration. This migration does NOT convert it.
-- It adds an org-scoped config table that owns everything ABOUT a stage — its
-- label, colour, position, and which one means "won" and which one means "the
-- end" — seeded from the enum so that day one is identical by construction.
--
-- `portal_accounts.stage` keeps its enum type and keeps being authoritative for
-- which stage an account is in. `portal_transition_stage` is NOT touched: not
-- its body, not its 0026 authorization guard, not its grants, not its
-- signature. `portal_stage_transitions` is not rewritten — it is the record of
-- what happened and this migration reads it never and writes it never.
--
-- Converting the column to text is a separate, later release. Doing both at
-- once lands on the pipeline board, the public API's `stage` enum and the
-- Salesforce bridge simultaneously, and each of them fails differently.
--
-- Rollback: supabase/down/0028_down.sql

-- ---------------------------------------------------------------------------
-- The config table
-- ---------------------------------------------------------------------------
create table portal_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),

  -- The IDENTITY. On day one every key is an enum label, which is what makes
  -- the seed a no-op. It is immutable (see the trigger below): the stage
  -- history refers to a stage by this value, and history is evidence.
  key text not null,
  -- The DISPLAY. This is what "rename a stage" changes, and changing it
  -- touches no history at all.
  label text not null,

  -- A theme token, not a hex value. Both themes already define these; a free
  -- colour field lets an operator pick something invisible in dark mode and
  -- gives the app no way to warn them.
  color text not null default 'idle'
    check (color in ('idle', 'ontrack', 'risk', 'blocked', 'primary')),

  sort_order int not null,

  -- Exactly one of each per org — see the partial unique indexes (at most one)
  -- and the deferred constraint trigger (at least one, and enterable).
  is_won boolean not null default false,
  is_terminal boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint portal_pipeline_stages_key_shape
    check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint portal_pipeline_stages_label_shape
    check (length(btrim(label)) between 1 and 60),

  -- DEFERRABLE because a reorder is a permutation, and a permutation cannot be
  -- applied row by row without transiently colliding. This is also why
  -- reordering is the RPC below rather than N writes from the app client,
  -- which auto-commits every statement.
  constraint portal_pipeline_stages_order_unique
    unique (org_id, sort_order) deferrable initially deferred
);

create unique index portal_pipeline_stages_key_idx
  on portal_pipeline_stages (org_id, key);
create unique index portal_pipeline_stages_won_idx
  on portal_pipeline_stages (org_id) where is_won;
create unique index portal_pipeline_stages_terminal_idx
  on portal_pipeline_stages (org_id) where is_terminal;

create trigger portal_pipeline_stages_touch before update on portal_pipeline_stages
  for each row execute function portal_touch_updated_at();

comment on table portal_pipeline_stages is
  'Configurable pre-sale pipeline stages. Owns label/colour/order/won/terminal. '
  'portal_accounts.stage stays a portal_account_stage enum and stays authoritative '
  'for membership until the conversion migration. See docs/design/presale-stages.md.';
comment on column portal_pipeline_stages.key is
  'Immutable identity. The stage history refers to a stage by this value.';

-- ---------------------------------------------------------------------------
-- Enterability: honest about what the enum still owns
-- ---------------------------------------------------------------------------
-- A stage configured with a key that is not an enum label cannot hold an
-- account yet — portal_transition_stage would reject it, correctly. Rather than
-- hide that, compute it and let the UI say so.
create or replace function portal_stage_key_enterable(p_key text)
returns boolean
language sql stable set search_path = public
as $$
  select exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'portal_account_stage'
       and t.typnamespace = 'public'::regnamespace
       and e.enumlabel = p_key
  );
$$;

create view portal_pipeline_stages_v with (security_invoker = true) as
  select
    s.id,
    s.org_id,
    s.key,
    s.label,
    s.color,
    s.sort_order,
    s.is_won,
    s.is_terminal,
    portal_stage_key_enterable(s.key) as enterable,
    s.created_at,
    s.updated_at
  from portal_pipeline_stages s;

-- ---------------------------------------------------------------------------
-- The key is the identity
-- ---------------------------------------------------------------------------
-- Renaming a stage must never rewrite history. It cannot, because history
-- refers to the key and this refuses to change one. Relabelling is free.
create or replace function portal_pipeline_stage_key_immutable()
returns trigger language plpgsql as $$
begin
  if new.key is distinct from old.key then
    raise exception
      'A pipeline stage key is its identity in the stage history and cannot be changed (% -> %). Change the label instead.',
      old.key, new.key;
  end if;
  if new.org_id is distinct from old.org_id then
    raise exception 'A pipeline stage cannot be moved between orgs';
  end if;
  return new;
end;
$$;

create trigger portal_pipeline_stages_key_guard before update on portal_pipeline_stages
  for each row execute function portal_pipeline_stage_key_immutable();

-- ---------------------------------------------------------------------------
-- A stage accounts sit in cannot be deleted
-- ---------------------------------------------------------------------------
-- RLS is not the mechanism here and could not be: every app read and write runs
-- on the service-role client and bypasses it. A trigger is the guarantee. The
-- server function repeats the check first only so the UI can render a good
-- error before the round trip.
--
-- The message carries the COUNT, because "cannot delete" without the number
-- tells the operator nothing they can act on.
create or replace function portal_pipeline_stage_delete_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  n bigint;
begin
  if old.is_won then
    raise exception
      'Stage "%" is the Closed Won stage. Mark another stage as Closed Won first, then delete this one.',
      old.label;
  end if;
  if old.is_terminal then
    raise exception
      'Stage "%" is the final stage. Mark another stage as final first, then delete this one.',
      old.label;
  end if;

  select count(*) into n from portal_accounts where stage::text = old.key;
  if n > 0 then
    raise exception
      'Stage "%" cannot be deleted: % account(s) are still in it. Move them to another stage first.',
      old.label, n;
  end if;

  -- A stage that only HISTORY names is deletable. The transition rows keep
  -- their enum values and keep rendering; the label lookup falls back to the
  -- raw key. Refusing this would mean a pipeline can only ever grow.
  return old;
end;
$$;

create trigger portal_pipeline_stages_delete_guard before delete on portal_pipeline_stages
  for each row execute function portal_pipeline_stage_delete_guard();

-- ---------------------------------------------------------------------------
-- Exactly one won stage, exactly one terminal stage, and both enterable
-- ---------------------------------------------------------------------------
-- The partial unique indexes above give at-MOST-one. This gives at-LEAST-one,
-- and it is DEFERRED so that moving a mark from one stage to another inside one
-- transaction is a legal move rather than a momentary violation.
--
-- The enterability rule is the invariant that stops this table breaking the
-- product while the enum is still authoritative: marking a stage no account can
-- ever enter as "won" would make startOnboarding unreachable for every deal.
--
-- Zero rows passes. An org either has a complete configuration or none at all,
-- and with none the app falls back to its compiled-in defaults — which is what
-- makes a deploy that lands before this migration behave exactly like today.
create or replace function portal_pipeline_stages_assert_marks()
returns trigger language plpgsql set search_path = public as $$
declare
  v_org uuid;
  v_total int;
  v_won int;
  v_terminal int;
  v_not_enterable text;
begin
  if tg_op = 'DELETE' then v_org := old.org_id; else v_org := new.org_id; end if;

  select count(*),
         count(*) filter (where is_won),
         count(*) filter (where is_terminal)
    into v_total, v_won, v_terminal
    from portal_pipeline_stages where org_id = v_org;

  if v_total = 0 then
    return null;
  end if;

  if v_won <> 1 then
    raise exception
      'Exactly one pipeline stage must be marked as the Closed Won stage (found %). The handoff gate, startOnboarding and the Salesforce bridge all read it.',
      v_won;
  end if;
  if v_terminal <> 1 then
    raise exception 'Exactly one pipeline stage must be marked as the final stage (found %)', v_terminal;
  end if;

  select string_agg(key, ', ' order by sort_order)
    into v_not_enterable
    from portal_pipeline_stages
   where org_id = v_org
     and (is_won or is_terminal)
     and not portal_stage_key_enterable(key);
  if v_not_enterable is not null then
    raise exception
      'The Closed Won and final stages must be stages an account can actually be in; % is not an account stage yet.',
      v_not_enterable;
  end if;

  return null;
end;
$$;

create constraint trigger portal_pipeline_stages_marks
  after insert or update or delete on portal_pipeline_stages
  deferrable initially deferred
  for each row execute function portal_pipeline_stages_assert_marks();

-- ---------------------------------------------------------------------------
-- Reordering is one statement
-- ---------------------------------------------------------------------------
-- Authorization is copied deliberately from 0026: the in-body check AND the
-- outer revoke. 0026 exists because a security-definer function was granted to
-- `authenticated` with no role check while PostgREST serves it publicly; a new
-- security-definer function that reshapes the pipeline should not have to
-- relearn that lesson.
--
-- It refuses a partial list. A p_keys missing a stage would silently shunt the
-- omitted stages somewhere, which is the kind of bug that reads as a UI glitch
-- for a month.
create or replace function portal_set_pipeline_stage_order(
  p_keys text[],
  p_org uuid default '00000000-0000-4000-8000-000000000001'
)
returns setof portal_pipeline_stages
language plpgsql
security definer set search_path = public
as $$
declare
  v_given int;
  v_total int;
  v_matched int;
begin
  if not (auth.role() = 'service_role' or portal_can_manage()) then
    raise exception
      'forbidden: reordering the pipeline requires an internal manager role';
  end if;

  v_given := coalesce(array_length(p_keys, 1), 0);
  if v_given = 0 then
    raise exception 'The stage order must list every stage';
  end if;
  if exists (select 1 from unnest(p_keys) as k group by k having count(*) > 1) then
    raise exception 'The stage order lists the same stage more than once';
  end if;

  select count(*) into v_total from portal_pipeline_stages where org_id = p_org;
  select count(*) into v_matched
    from portal_pipeline_stages where org_id = p_org and key = any (p_keys);

  if v_total <> v_given or v_matched <> v_total then
    raise exception
      'The stage order must list every stage exactly once (% configured, % given, % matched)',
      v_total, v_given, v_matched;
  end if;

  update portal_pipeline_stages s
     set sort_order = o.ord::int
    from (select k, ord from unnest(p_keys) with ordinality as u(k, ord)) o
   where s.org_id = p_org
     and s.key = o.k
     and s.sort_order is distinct from o.ord::int;

  return query
    select * from portal_pipeline_stages where org_id = p_org order by sort_order;
end;
$$;

revoke execute on function portal_set_pipeline_stage_order(text[], uuid)
  from public, anon, authenticated;
grant execute on function portal_set_pipeline_stage_order(text[], uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Moving the Closed Won / final mark is also one statement
-- ---------------------------------------------------------------------------
-- Two reasons this cannot be done from the app client. The partial unique
-- indexes above are INDEXES, which are never deferrable, so "set the new one"
-- must follow "unset the old one" — and PostgREST auto-commits each statement,
-- which would leave the pipeline with no won stage between the two round trips.
-- Inside one function it is one transaction: unset, set, and the deferred marks
-- trigger validates the pair at commit.
--
-- Same authorization shape as above, for the same 0026 reason.
create or replace function portal_set_pipeline_stage_mark(
  p_key text,
  p_mark text,
  p_org uuid default '00000000-0000-4000-8000-000000000001'
)
returns setof portal_pipeline_stages
language plpgsql
security definer set search_path = public
as $$
begin
  if not (auth.role() = 'service_role' or portal_can_manage()) then
    raise exception
      'forbidden: changing the Closed Won or final stage requires an internal manager role';
  end if;
  if p_mark not in ('won', 'terminal') then
    raise exception 'A pipeline stage mark is either "won" or "terminal", not "%"', p_mark;
  end if;
  if not exists (
    select 1 from portal_pipeline_stages where org_id = p_org and key = p_key
  ) then
    raise exception 'No pipeline stage "%" is configured', p_key;
  end if;

  if p_mark = 'won' then
    update portal_pipeline_stages set is_won = false
      where org_id = p_org and is_won and key <> p_key;
    update portal_pipeline_stages set is_won = true
      where org_id = p_org and key = p_key and not is_won;
  else
    update portal_pipeline_stages set is_terminal = false
      where org_id = p_org and is_terminal and key <> p_key;
    update portal_pipeline_stages set is_terminal = true
      where org_id = p_org and key = p_key and not is_terminal;
  end if;

  return query
    select * from portal_pipeline_stages where org_id = p_org order by sort_order;
end;
$$;

revoke execute on function portal_set_pipeline_stage_mark(text, text, uuid)
  from public, anon, authenticated;
grant execute on function portal_set_pipeline_stage_mark(text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
-- RLS here is defense in depth ONLY. Every app path runs on the service-role
-- client and bypasses it; the guarantees above are triggers for exactly that
-- reason. What the policies buy is that a PostgREST caller holding an ordinary
-- JWT cannot reshape the pipeline, and the revoke below is the outer door.
alter table portal_pipeline_stages enable row level security;

create policy "pipeline stages readable" on portal_pipeline_stages
  for select using (portal_is_internal());
create policy "pipeline stages managed" on portal_pipeline_stages
  for all using (portal_can_manage()) with check (portal_can_manage());

grant select on portal_pipeline_stages to authenticated;
grant select, insert, update, delete on portal_pipeline_stages to service_role;
grant select on portal_pipeline_stages_v to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed: the enum, in enum order, with the labels the UI already renders
-- ---------------------------------------------------------------------------
-- This is what makes day one identical. Every value here is already in
-- src/lib/presale-stages.ts; the only new fact in the database is that those
-- five strings now have rows describing them.
--
-- One statement, so the deferred marks trigger sees all five rows at commit.
--
-- Guarded on emptiness rather than ON CONFLICT: the order constraint is
-- deferrable and Postgres will not use a deferrable constraint as a conflict
-- arbiter. "Seed only an unconfigured deployment" is also the rule we actually
-- want — a re-run must never quietly reinstate a stage an operator deleted.
insert into portal_pipeline_stages (key, label, color, sort_order, is_won, is_terminal)
select v.key, v.label, v.color, v.sort_order, v.is_won, v.is_terminal
  from (values
    ('prospect',            'Prospect',            'idle',    1, false, false),
    ('closed_won',          'Closed Won',          'ontrack', 2, true,  false),
    ('onboarding_kickoff',  'Onboarding Kickoff',  'primary', 3, false, false),
    ('in_onboarding',       'In Onboarding',       'primary', 4, false, false),
    ('onboarding_complete', 'Onboarding Complete', 'ontrack', 5, false, true)
  ) as v (key, label, color, sort_order, is_won, is_terminal)
 where not exists (select 1 from portal_pipeline_stages);
