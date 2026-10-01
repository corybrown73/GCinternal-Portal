-- 0070: Negotiate & Finalize on the pipeline, right after Prospect, and the
-- Closed Won gate widened to cover it.
--
-- The row is seeded only where it is missing; the order is set with the same
-- function the admin screen uses, so the deferrable order constraint is
-- honoured and nothing else about the configured pipeline changes.
insert into portal_pipeline_stages (key, label, color, sort_order, is_won, is_terminal)
select 'negotiate', 'Negotiate & Finalize', 'idle',
       (select coalesce(max(sort_order), 0) + 1 from portal_pipeline_stages), false, false
 where not exists (select 1 from portal_pipeline_stages where key = 'negotiate');

do $$
declare
  v_keys text[];
begin
  select array_agg(key order by ord)
    into v_keys
    from (
      select key,
             case
               when key = 'negotiate'
                 then (select sort_order + 0.5 from portal_pipeline_stages where key = 'prospect' limit 1)
               else sort_order::numeric
             end as ord
        from portal_pipeline_stages
    ) s;
  perform portal_set_pipeline_stage_order(v_keys);
end $$;

-- The gate (0065) fired only for a person moving a Prospect forward. With a
-- stage before Closed Won that is not Prospect, a human move Negotiate →
-- Closed Won would have slipped past it. The gate now covers every human
-- move out of a pre-close stage into a closed one; moving between Prospect
-- and Negotiate is not gated. Everything else is the 0065 body.
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
  v_missing text[] := '{}';
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

  -- The gate: a person moving a deal that is not yet closed into a closed stage.
  if p_source = 'ui'
     and v_from in ('prospect', 'negotiate')
     and p_to_stage not in ('prospect', 'negotiate')
     and coalesce(p_note, '') not like 'force:%' then
    if not exists (select 1 from portal_gong_reports g where g.account_id = p_account_id) then
      v_missing := array_append(v_missing, 'notes');
    end if;
    if not exists (
      select 1 from portal_accounts a
       where a.id = p_account_id
         and (a.sow_document_path is not null or nullif(trim(a.sow_reference), '') is not null)
    ) then
      v_missing := array_append(v_missing, 'sow');
    end if;
    if array_length(v_missing, 1) > 0 then
      raise exception 'closed_won_gate:%', array_to_string(v_missing, ',');
    end if;
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
