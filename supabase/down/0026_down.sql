-- Down for 0026_rpc_authorization.sql
--
-- READ THIS BEFORE RUNNING IT.
--
-- This rollback RE-OPENS a privilege escalation. 0026 exists because
-- `portal_transition_stage` is SECURITY DEFINER and was executable by
-- `authenticated` with no role check, which let any logged-in user — including
-- a customer — move any account to Closed Won through PostgREST. Rolling this
-- back restores exactly that.
--
-- It is written anyway, because the repo's rule is that every migration has a
-- tested down and a rollback nobody can run is not a rollback. But the grant
-- is NOT restored automatically: the function is returned to its pre-0026 body
-- while EXECUTE stays with service_role only. That keeps up -> down -> up
-- honest without handing the hole back to the internet as a side effect of a
-- routine rollback.
--
-- To fully restore pre-0026 behaviour (you almost certainly do not want this):
--   grant execute on function portal_transition_stage(
--     uuid, portal_account_stage, portal_transition_source, uuid, uuid, text, timestamptz
--   ) to authenticated;

-- The 0007 body, verbatim, without the authorization guard.
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

-- The trigger-function revokes are not undone: nothing ever legitimately
-- called those directly, and re-granting EXECUTE to `anon` on rollback would
-- be restoring a mistake rather than a behaviour.

-- The search_path pin is not undone either. Unpinning it would make the
-- include_when evaluator steerable by session state again, and no caller can
-- depend on that.

-- `_backfill_0015_skipped` is NOT recreated. It was a one-shot diagnostic from
-- 0015's backfill, and 0015's own down drops it; recreating an empty copy here
-- would just restore a PostgREST-exposed table with RLS off. If 0026 archived
-- rows, they remain in v2_archive.backfill_0015_skipped.
