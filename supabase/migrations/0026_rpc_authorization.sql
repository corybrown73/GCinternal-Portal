-- 0026 — Close the stage-transition privilege escalation, and two linter findings.
--
-- FOUND BY BLACK-BOX QA (SEC-01/02/03), CONFIRMED AGAINST PRODUCTION.
--
-- SEC-01 is the one that matters. `portal_transition_stage` is SECURITY
-- DEFINER — so it runs as its owner and RLS does not apply — and EXECUTE was
-- granted to `authenticated` with no role check anywhere in the body. Supabase
-- exposes PostgREST publicly, so ANY logged-in user could
--
--   POST /rest/v1/rpc/portal_transition_stage
--
-- with their own JWT and move ANY account to ANY stage, including closed_won.
-- Production has a customer-role profile today, so this was reachable by
-- someone outside the company, from a browser console, with no UI involved.
--
-- This is also why a Closed Won gate can never live in the UI: the UI is not
-- the only caller. The check belongs here, where every path meets.
--
-- Ordering note: this migration is deliberately self-contained with respect to
-- 0019-0025. It touches only objects that exist as of 0018 (the last migration
-- applied to production), so it can be applied ahead of them to close the hole
-- without waiting for the Phase 4-7 schema.

-- ---------------------------------------------------------------------------
-- SEC-01. The lock, and the door.
-- ---------------------------------------------------------------------------
-- Both, not either. The in-body check is the real guarantee — it holds for any
-- caller however they reach the function, including a future GRANT somebody
-- adds without reading this file. The REVOKE is the outer door: with it, an
-- ordinary user's call is refused before the body runs at all.
--
-- The body is otherwise IDENTICAL to what 0007 shipped. The only change is the
-- five-line guard at the top; the actor/source coercion, the FOR UPDATE lock,
-- the no-op-on-same-stage return, the set_config dance and the transition
-- insert are all reproduced verbatim so this is a pure authorization change.
create or replace function portal_transition_stage(
  p_account_id uuid,
  p_to_stage portal_account_stage,
  p_source portal_transition_source default 'ui',
  p_actor_profile uuid default null,
  p_actor_api_key uuid default null,
  p_note text default null,
  p_occurred_at timestamptz default null
)
returns portal_stage_transitions
language plpgsql
security definer set search_path = public
as $$
declare
  v_from portal_account_stage;
  v_row portal_stage_transitions;
begin
  -- service_role is the application itself (every server function runs on it,
  -- and authorization for those paths is enforced in app code). Any other
  -- caller is a real end user holding a JWT and must be an internal manager.
  if not (auth.role() = 'service_role' or portal_can_manage()) then
    raise exception
      'forbidden: moving an account between stages requires an internal manager role';
  end if;

  if auth.uid() is not null then
    p_actor_profile := auth.uid();
    p_source := 'ui';
    p_actor_api_key := null;
  end if;

  select stage into v_from from portal_accounts where id = p_account_id for update;
  if not found then
    raise exception 'Account % not found', p_account_id;
  end if;
  if v_from = p_to_stage then
    return null;
  end if;

  perform set_config('app.allow_stage_change', 'on', true);
  update portal_accounts
    set stage = p_to_stage,
        stage_entered_at = coalesce(p_occurred_at, now())
    where id = p_account_id;
  perform set_config('app.allow_stage_change', '', true);

  insert into portal_stage_transitions
    (account_id, from_stage, to_stage, source, actor_profile_id, actor_api_key_id, note, occurred_at)
  values
    (p_account_id, v_from, p_to_stage, p_source, p_actor_profile, p_actor_api_key, p_note,
     coalesce(p_occurred_at, now()))
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function portal_transition_stage(
  uuid, portal_account_stage, portal_transition_source, uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function portal_transition_stage(
  uuid, portal_account_stage, portal_transition_source, uuid, uuid, text, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- Trigger functions are not an API.
-- ---------------------------------------------------------------------------
-- Low severity: plpgsql refuses to run a trigger function outside trigger
-- context, so these were not exploitable. But a function reachable by `anon`
-- that was never meant to be called is noise in every future audit, and the
-- next person has to re-derive that it is harmless. Revoke and be done.
revoke execute on function implementations_parent_guard() from public, anon, authenticated;
revoke execute on function journey_template_frozen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SEC-03. Pin the evaluator's search_path.
-- ---------------------------------------------------------------------------
-- Not SECURITY DEFINER, so this is hardening rather than a hole: it cannot be
-- used to run code as someone else. But it resolves `jsonb` operators and
-- comparison functions by name, and an unpinned search_path means a caller
-- controls which ones. This function decides whether a task is included in a
-- customer's plan; it should not be steerable by session state.
--
-- Body reproduced verbatim from 0017 — the ONLY change is the SET clause. The
-- fail-closed semantics 0017 established are unchanged, and the TypeScript
-- mirror in src/lib/journey-conditions.ts stays in step.
do $$
declare
  body text;
begin
  select pg_get_functiondef(p.oid) into body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'journey_include_when_matches';

  if body is null then
    raise notice 'journey_include_when_matches absent; nothing to pin';
  elsif body ilike '%search_path%' then
    raise notice 'journey_include_when_matches already pins search_path';
  else
    execute 'alter function journey_include_when_matches(jsonb, jsonb) set search_path = public';
    raise notice 'pinned search_path on journey_include_when_matches';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- SEC-02. Drop the backfill diagnostic table.
-- ---------------------------------------------------------------------------
-- 0015 created `_backfill_0015_skipped` in `public` to report implementations
-- whose stage did not normalise. Anything in `public` is served by PostgREST,
-- and this one has RLS disabled — the linter rates that an ERROR.
--
-- It is empty in production (every implementation normalised), it was always a
-- one-shot diagnostic rather than a record, and 0015's own down script drops
-- it. So it goes. If a future backfill needs the same reporting it should
-- write somewhere that is not a public API surface.
--
-- Guarded on emptiness: if a re-run of 0015 ever DID skip something, that is
-- evidence about real data and this migration must not throw it away silently.
do $$
declare
  n int;
begin
  if to_regclass('public._backfill_0015_skipped') is null then
    raise notice '_backfill_0015_skipped already absent';
    return;
  end if;
  execute 'select count(*) from public._backfill_0015_skipped' into n;
  if n > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.backfill_0015_skipped
             as table public._backfill_0015_skipped';
    raise notice 'archived % skipped-backfill row(s) to v2_archive before dropping', n;
  end if;
  execute 'drop table public._backfill_0015_skipped';
end $$;
