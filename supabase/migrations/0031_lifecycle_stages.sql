-- 0031 — The post-sale stages become editable.
--
-- 0028 did this for the PRE-sale pipeline. This is the other half, and the two
-- together are the point of the product: one tool covering pre-sale and
-- post-sale, with both halves named the way this team actually names them.
--
-- WHAT IS EDITABLE, AND THE REASON THE LINE IS WHERE IT IS.
--
-- Editable: the label, the intent text, the colour, the order. Adding a stage
-- of your own is allowed too.
--
-- NOT editable: the `key` of a built-in stage, and built-in stages cannot be
-- deleted. This is not caution — it is a fact about the code. Roughly
-- twenty-five places key off specific stage ids: `launch` drives the launch
-- gate, `adopt` and `graduate-to-cs` drive graduation readiness, the CS
-- handoff, the SLA cron and the churn signal, `handoff` is where
-- startOnboarding puts a new implementation, and the Salesforce bridge maps
-- `graduate-to-cs` to a closed opportunity. Renaming "Adopt" to "Embed" must
-- change what people read and nothing else; deleting it would silently disable
-- graduation.
--
-- So: rename freely, reorder freely, recolour freely, add your own. The
-- guarantee is that none of that can break a rule the code enforces.
--
-- Unlike 0028 there is no enum in the way — `implementations.current_stage` is
-- already text — so a stage you add is enterable the moment you add it. What it
-- is NOT is part of any coded rule, and the admin screen says so rather than
-- letting somebody discover it.
--
-- Rollback: supabase/down/0031_down.sql

create table portal_lifecycle_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),

  -- The IDENTITY, and for the eight built-ins it is a value the application
  -- code contains as a literal. Immutable: `implementations.current_stage` and
  -- every row of `implementation_stage_history` refer to a stage by this value,
  -- and that history is evidence.
  key text not null,
  label text not null,
  -- What "done" means here, in the team's words. Rendered on the settings page
  -- and the stage rail.
  intent text,

  phase text not null default 'delivery'
    check (phase in ('intake', 'delivery', 'value', 'steady-state')),
  color text not null default 'idle'
    check (color in ('idle', 'ontrack', 'risk', 'blocked', 'primary')),

  sort_order int not null,

  -- True for the eight stages the code keys off. Set by the seed below and by
  -- nothing else; the trigger refuses to change it, so a stage cannot be
  -- promoted into load-bearing status or demoted out of it by an UPDATE.
  is_builtin boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint portal_lifecycle_stages_key_shape
    check (key ~ '^[a-z][a-z0-9-]{1,39}$'),
  constraint portal_lifecycle_stages_label_shape
    check (length(btrim(label)) between 1 and 60),
  constraint portal_lifecycle_stages_intent_shape
    check (intent is null or length(btrim(intent)) between 1 and 400),

  -- DEFERRABLE for the same reason as 0028: a reorder is a permutation, and a
  -- permutation cannot be applied row by row without transiently colliding.
  constraint portal_lifecycle_stages_order_unique
    unique (org_id, sort_order) deferrable initially deferred
);

create unique index portal_lifecycle_stages_key_idx
  on portal_lifecycle_stages (org_id, key);

create trigger portal_lifecycle_stages_touch before update on portal_lifecycle_stages
  for each row execute function portal_touch_updated_at();

comment on table portal_lifecycle_stages is
  'Editable labels, intents, colours and order for the post-sale lifecycle. The '
  'KEY of a built-in stage is immutable and the row undeletable: application code '
  'keys off these ids. See docs/design/lifecycle-stages.md.';
comment on column portal_lifecycle_stages.is_builtin is
  'True for the eight stages application code names as literals. Immutable.';

-- ---------------------------------------------------------------------------
-- The key is the identity, and built-in is a fact not a setting
-- ---------------------------------------------------------------------------
create or replace function portal_lifecycle_stage_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.key is distinct from old.key then
    raise exception
      'A lifecycle stage key is how the history and the code refer to this stage and cannot be changed (% -> %). Change the label instead — nothing else has to move.',
      old.key, new.key;
  end if;
  if new.is_builtin is distinct from old.is_builtin then
    raise exception
      'Whether a stage is built in is a fact about the application code, not a setting';
  end if;
  if new.org_id is distinct from old.org_id then
    raise exception 'A lifecycle stage cannot be moved between orgs';
  end if;
  return new;
end $$;

create trigger portal_lifecycle_stages_key_guard
  before update on portal_lifecycle_stages
  for each row execute function portal_lifecycle_stage_guard();

-- ---------------------------------------------------------------------------
-- What cannot be deleted
-- ---------------------------------------------------------------------------
-- Two refusals with two different messages, because they need two different
-- things from the operator. "It is built in" is permanent; "three projects are
-- in it" is something they can act on, so the count is in the message.
create or replace function portal_lifecycle_stage_delete_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  n bigint;
begin
  if old.is_builtin then
    raise exception
      'Stage "%" cannot be deleted: the application keys off it (launch gates, graduation readiness, the CS handoff and the Salesforce bridge all name specific stages). Rename it instead — that changes what people read and nothing else.',
      old.label;
  end if;

  select count(*) into n from implementations where current_stage = old.key;
  if n > 0 then
    raise exception
      'Stage "%" cannot be deleted: % project(s) are in it. Move them to another stage first.',
      old.label, n;
  end if;

  -- A stage that only HISTORY names is deletable. The history rows keep their
  -- text values and keep rendering; the label lookup falls back to the raw key.
  return old;
end $$;

create trigger portal_lifecycle_stages_delete_guard
  before delete on portal_lifecycle_stages
  for each row execute function portal_lifecycle_stage_delete_guard();

-- ---------------------------------------------------------------------------
-- Every built-in stage must still exist
-- ---------------------------------------------------------------------------
-- The delete guard above covers DELETE. This covers the other way a built-in
-- could vanish: an org row deleted and re-seeded wrong, or a bulk operation.
-- Deferred, so a reseed inside one transaction is legal.
--
-- Zero rows passes: an org with no configuration at all falls back to the
-- compiled-in defaults, which is what makes a deploy that lands ahead of this
-- migration behave exactly like today.
create or replace function portal_lifecycle_stages_assert_builtins()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
  v_total int;
  v_missing text;
begin
  if tg_op = 'DELETE' then v_org := old.org_id; else v_org := new.org_id; end if;

  select count(*) into v_total from portal_lifecycle_stages where org_id = v_org;
  if v_total = 0 then
    return null;
  end if;

  select string_agg(k, ', ')
    into v_missing
    from unnest(array[
      'handoff', 'plan-internal', 'align-external', 'build',
      'validate-iterate', 'launch', 'adopt', 'graduate-to-cs'
    ]) as k
   where not exists (
     select 1 from portal_lifecycle_stages s where s.org_id = v_org and s.key = k
   );

  if v_missing is not null then
    raise exception
      'These lifecycle stages are named directly by application code and must exist: %',
      v_missing;
  end if;
  return null;
end $$;

create constraint trigger portal_lifecycle_stages_builtins
  after insert or update or delete on portal_lifecycle_stages
  deferrable initially deferred
  for each row execute function portal_lifecycle_stages_assert_builtins();

-- ---------------------------------------------------------------------------
-- Reordering is one statement
-- ---------------------------------------------------------------------------
-- Authorization copied from 0026 and 0028: the in-body role check AND the outer
-- revoke. A new security-definer function should not have to relearn why.
create or replace function portal_set_lifecycle_stage_order(
  p_keys text[],
  p_org uuid default '00000000-0000-4000-8000-000000000001'
)
returns setof portal_lifecycle_stages
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
      'forbidden: reordering the lifecycle requires an internal manager role';
  end if;

  v_given := coalesce(array_length(p_keys, 1), 0);
  if v_given = 0 then
    raise exception 'The stage order must list every stage';
  end if;
  if exists (select 1 from unnest(p_keys) as k group by k having count(*) > 1) then
    raise exception 'The stage order lists the same stage more than once';
  end if;

  select count(*) into v_total from portal_lifecycle_stages where org_id = p_org;
  select count(*) into v_matched
    from portal_lifecycle_stages where org_id = p_org and key = any (p_keys);

  -- A partial list would silently shunt the omitted stages somewhere, which
  -- reads as a UI glitch for a month.
  if v_total <> v_given or v_matched <> v_total then
    raise exception
      'The stage order must list every stage exactly once (% configured, % given, % matched)',
      v_total, v_given, v_matched;
  end if;

  update portal_lifecycle_stages s
     set sort_order = o.ord::int
    from (select k, ord from unnest(p_keys) with ordinality as u(k, ord)) o
   where s.org_id = p_org
     and s.key = o.k
     and s.sort_order is distinct from o.ord::int;

  return query
    select * from portal_lifecycle_stages where org_id = p_org order by sort_order;
end $$;

revoke execute on function portal_set_lifecycle_stage_order(text[], uuid)
  from public, anon, authenticated;
grant execute on function portal_set_lifecycle_stage_order(text[], uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
-- Defense in depth only: every app path runs on the service role and bypasses
-- RLS. The guarantees above are triggers for exactly that reason. What the
-- policies buy is that an ordinary JWT reaching PostgREST directly cannot
-- rewrite the lifecycle.
alter table portal_lifecycle_stages enable row level security;

create policy "lifecycle stages readable" on portal_lifecycle_stages
  for select using (portal_is_internal());
create policy "lifecycle stages managed" on portal_lifecycle_stages
  for all using (portal_can_manage()) with check (portal_can_manage());

grant select on portal_lifecycle_stages to authenticated;
grant select, insert, update, delete on portal_lifecycle_stages to service_role;

-- ---------------------------------------------------------------------------
-- Seed: LIFECYCLE_STAGES, verbatim
-- ---------------------------------------------------------------------------
-- Every value here is already in src/lib/lifecycle.ts. Day one is identical by
-- construction; the only new fact in the database is that those eight strings
-- now have rows describing them.
--
-- Guarded on emptiness rather than ON CONFLICT: the order constraint is
-- deferrable, and Postgres will not use a deferrable constraint as a conflict
-- arbiter. "Seed only an unconfigured deployment" is also the rule we want — a
-- re-run must never quietly reinstate a stage an operator renamed.
insert into portal_lifecycle_stages (key, label, intent, phase, color, sort_order, is_builtin)
select v.key, v.label, v.intent, v.phase, v.color, v.sort_order, true
  from (values
    ('handoff', 'Handoff',
     'Sales-to-implementation transfer of context, promises and risks accepted by the Technical Implementation Specialist.',
     'intake', 'primary', 1),
    ('plan-internal', 'Plan (internal)',
     'The internal plan is agreed before anything is put in front of the customer.',
     'delivery', 'idle', 2),
    ('align-external', 'Align (external)',
     'The customer has agreed the plan, the dates and who owns what.',
     'delivery', 'primary', 3),
    ('build', 'Build',
     'Configuration and integration work against the agreed scope.',
     'delivery', 'primary', 4),
    ('validate-iterate', 'Validate and iterate',
     'The customer has tested it against their own process and the gaps are closed.',
     'delivery', 'risk', 5),
    ('launch', 'Launch',
     'Live with real users doing real work.',
     'value', 'ontrack', 6),
    ('adopt', 'Adopt',
     'Usage is real and the success criteria are being met, not merely available.',
     'value', 'ontrack', 7),
    ('graduate-to-cs', 'Graduate to CS',
     'Steady state, and Customer Success has accepted the account.',
     'steady-state', 'ontrack', 8)
  ) as v (key, label, intent, phase, color, sort_order)
 where not exists (select 1 from portal_lifecycle_stages);
