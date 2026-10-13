-- Reverses 0084. Refuses while partner progression has run: those rows are records.
do $$
begin
  if exists (select 1 from notification_outbox)
     or exists (select 1 from implementation_stage_history h
                  join implementations i on i.id = h.implementation_id
                 where i.journey_type = 'partner_implementation' and h.stage = 'form_finalisation') then
    raise exception 'Partner progression has run; its records must be kept before 0084 is reversed';
  end if;
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
