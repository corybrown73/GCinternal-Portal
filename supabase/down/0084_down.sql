-- Reverses 0084. Refuses while partner progression has run: those rows are records.
do $$
begin
  if exists (select 1 from notification_outbox)
     or exists (select 1 from implementation_stage_history h
                  join implementations i on i.id = h.implementation_id
                 where i.journey_type = 'partner_implementation' and h.stage = 'form_finalisation') then
    raise exception 'Partner progression has run; its records must be kept before 0084 is reversed';
  end if;
  drop trigger if exists work_items_partner_gate_skip_guard on work_items;
  drop function if exists partner_gate_skip_guard();
  drop function if exists claim_notices(int, int);
  drop function if exists finish_notice(uuid, uuid, text, text, timestamptz);
  drop function if exists partner_implementation_graduate(uuid, uuid, uuid, timestamptz);
  drop function if exists partner_implementation_handoff(uuid, uuid, uuid, uuid, jsonb, jsonb, timestamptz);
  drop function if exists advance_partner_stage(uuid, text, uuid, uuid, text, timestamptz);
  drop function if exists partner_complete_milestone(uuid, text, text, timestamptz);
  drop function if exists partner_record(uuid, uuid, text, jsonb, uuid, timestamptz);
  drop function if exists partner_lock(uuid);
  drop function if exists partner_move_stage(uuid, text, uuid, text, boolean, timestamptz);
  drop function if exists partner_gate_outstanding(uuid, text);
  drop function if exists partner_next_stage(uuid, text);
  drop table if exists notification_outbox;
end $$;

-- Restore the 0014 definition of resync_stage_instances, which 0084 redefined.
create or replace function resync_stage_instances(p_implementation_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  cur_key text;
  cur_pos int;
  changed int := 0;
begin
  if not (auth.role() = 'service_role' or portal_is_internal()) then
    raise exception 'forbidden';
  end if;

  select current_stage into cur_key from implementations where id = p_implementation_id;
  select position into cur_pos from stage_instances
   where implementation_id = p_implementation_id and stage_key = cur_key;
  if cur_pos is null then
    return jsonb_build_object('ok', false, 'reason', 'current_stage has no stage_instance');
  end if;

  update stage_instances
     set status = case
       when position < cur_pos then 'done'
       when position = cur_pos then 'active'
       else 'pending'
     end
   where implementation_id = p_implementation_id
     and status <> case
       when position < cur_pos then 'done'
       when position = cur_pos then 'active'
       else 'pending'
     end;
  get diagnostics changed = row_count;

  if changed > 0 then
    insert into journey_events (implementation_id, kind, detail)
    values (p_implementation_id, 'stage_resynced',
            jsonb_build_object('current_stage', cur_key, 'rows_changed', changed));
  end if;

  return jsonb_build_object('ok', true, 'rows_changed', changed);
end;
$$;
