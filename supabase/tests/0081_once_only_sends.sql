-- Probe for 0081: a second claim on the same day's report, or on the same
-- deal, nudge and hour, is refused; the next hour, another deal or another
-- action is not. Nothing is left behind.
do $$
declare
  v_deal uuid := gen_random_uuid();
  v_day text := 'probe-0081-' || gen_random_uuid()::text;
begin
  insert into portal_audit_log (actor_type, action, entity_type, entity_key, payload)
  values ('system', 'report.daily_sent', 'app', v_day, '{}'::jsonb);
  begin
    insert into portal_audit_log (actor_type, action, entity_type, entity_key, payload)
    values ('system', 'report.daily_sent', 'app', v_day, '{}'::jsonb);
    raise exception '0081: a second daily report claim for one day was accepted';
  exception when unique_violation then
    null;
  end;

  insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
  values ('system', 'deal.nudge_claim', 'account', v_deal,
          jsonb_build_object('key', 'k', 'claim', 'k@2026-10-09T14'));
  begin
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'deal.nudge_claim', 'account', v_deal,
            jsonb_build_object('key', 'k', 'claim', 'k@2026-10-09T14'));
    raise exception '0081: a second nudge claim for one hour was accepted';
  exception when unique_violation then
    null;
  end;

  -- The next hour may claim it again (a failed recipient's retry).
  insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
  values ('system', 'deal.nudge_claim', 'account', v_deal,
          jsonb_build_object('key', 'k', 'claim', 'k@2026-10-09T15'));

  -- Other actions are untouched: deal.nudged rows repeat per key by design.
  insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
  values ('system', 'deal.nudged', 'account', v_deal, jsonb_build_object('key', 'k'));
  insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
  values ('system', 'deal.nudged', 'account', v_deal, jsonb_build_object('key', 'k'));

  delete from portal_audit_log where entity_id = v_deal or entity_key = v_day;
  raise notice 'probe 0081 ok';
end $$;
