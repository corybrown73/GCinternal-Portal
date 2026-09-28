-- Reverses 0065: the transition function without the Closed Won gate (the
-- 0026 body). Nothing else changed.
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
