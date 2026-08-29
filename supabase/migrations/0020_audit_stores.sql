-- 0020 — Audit stores learn to record a non-employee actor.
--
-- Design: docs/design/portal-access.md §2.4 ("portal_audit_log.actor_type gains
-- 'external_contact'"), extended to the second store per decision 3 in
-- docs/PLAN.md: `audit_log` is the account activity feed the hub UI actually
-- reads, `portal_audit_log` is the action-level security log. A customer
-- completing a task from a link has to be recordable in BOTH — that is the
-- Phase 4 exit criterion ("audited in both stores").
--
-- The problem this fixes: `audit_log.changed_by` references team_members. An
-- external contact is not a team member and never will be, so today an external
-- action can only be written to the activity feed as an anonymous change. Three
-- nullable columns give it a name without inventing a team member row.
--
-- Constraint names are not assumed. `portal_audit_log`'s actor_type CHECK was
-- created inline in 0001 and therefore carries a generated name; it is located
-- in the catalog by its definition rather than hardcoded, because a name that
-- differs in production would otherwise fail the migration there and nowhere
-- else.
--
-- Rollback: supabase/down/0020_down.sql (archives external rows; never rewrites
-- an actor_type in place — that would falsify the audit trail).

-- ---------------------------------------------------------------------------
-- A. portal_audit_log — widen the actor vocabulary
-- ---------------------------------------------------------------------------
do $$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.portal_audit_log'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%actor_type%';
  if cname is not null then
    execute format('alter table portal_audit_log drop constraint %I', cname);
  end if;
end $$;

alter table portal_audit_log
  add constraint portal_audit_log_actor_type_check
  check (actor_type in ('user', 'api_key', 'email_token', 'system', 'external_contact'));

-- ---------------------------------------------------------------------------
-- B. audit_log — an actor that is not a team member
-- ---------------------------------------------------------------------------
-- All three are nullable and default to nothing, so every existing row and
-- every existing writer is untouched: a row with actor_type null is exactly
-- what it was before, "changed_by, or nobody recorded".
--
-- `if not exists` is load-bearing: 0020_down KEEPS these columns (they hold the
-- recorded identity of a person who did something, which a rollback of the
-- feature must not erase), so a re-apply finds them already present.
alter table audit_log
  -- Who, in kind. 'team_member' is what every pre-0020 row means.
  add column if not exists actor_type text,
  -- Display name for an actor that has no team_members row. Denormalized on
  -- purpose: a contact can be deleted, and the feed must still be able to say
  -- who did it.
  add column if not exists actor_label text,
  add column if not exists actor_contact_id uuid references customer_contacts (id) on delete set null;

do $$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.audit_log'::regclass
     and contype = 'c'
     and conname = 'audit_log_actor_type_check';
  if cname is not null then
    execute format('alter table audit_log drop constraint %I', cname);
  end if;
end $$;

alter table audit_log
  add constraint audit_log_actor_type_check
  check (actor_type is null or actor_type in
    ('team_member', 'customer_user', 'external_contact', 'api_key', 'system'));

create index if not exists audit_log_actor_contact_idx
  on audit_log (actor_contact_id)
  where actor_contact_id is not null;

comment on column audit_log.actor_type is
  'Kind of actor. NULL means a pre-0020 row: read changed_by. Added by 0020 so an external contact can appear in the activity feed without a fabricated team_members row.';
