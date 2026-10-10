-- Probe for 0080: a second alert for the same kind, subject and visit is
-- refused, acknowledged or not; another visit, another subject, or a row
-- with no visit at all is not. Nothing is left behind.
do $$
declare
  v_customer uuid;
  v_impl uuid;
  v_deal uuid := gen_random_uuid();
begin
  insert into customers (name) values ('probe 0080 customer') returning id into v_customer;
  insert into implementations (customer_id, name, current_stage)
  values (v_customer, 'probe 0080 implementation', 'kickoff')
  returning id into v_impl;

  insert into alerts (kind, title, implementation_id, payload, acknowledged_at)
  values ('stalled_implementation', 'probe stall', v_impl,
          jsonb_build_object('visit', 'kickoff@2026-10-01T00:00:00Z'), now());

  begin
    insert into alerts (kind, title, implementation_id, payload)
    values ('stalled_implementation', 'probe stall again', v_impl,
            jsonb_build_object('visit', 'kickoff@2026-10-01T00:00:00Z'));
    raise exception '0080: a second alert for the same visit was accepted';
  exception when unique_violation then
    null;
  end;

  -- A new visit of the same stage is a new alert.
  insert into alerts (kind, title, implementation_id, payload)
  values ('stalled_implementation', 'probe stall, next visit', v_impl,
          jsonb_build_object('visit', 'kickoff@2026-10-08T00:00:00Z'));

  -- A deal with no implementation is keyed by the deal in the payload.
  insert into alerts (kind, title, payload)
  values ('stalled_implementation', 'probe deal stall', jsonb_build_object(
    'visit', 'closed_won@2026-10-01T00:00:00Z', 'deal_id', v_deal::text));
  begin
    insert into alerts (kind, title, payload)
    values ('stalled_implementation', 'probe deal stall again', jsonb_build_object(
      'visit', 'closed_won@2026-10-01T00:00:00Z', 'deal_id', v_deal::text));
    raise exception '0080: a second alert for the same deal visit was accepted';
  exception when unique_violation then
    null;
  end;

  -- No visit: no limit.
  insert into alerts (kind, title, implementation_id, payload)
  values ('external', 'probe a', v_impl, '{}'::jsonb),
         ('external', 'probe b', v_impl, '{}'::jsonb);

  delete from alerts where title like 'probe %';
  delete from customers where id = v_customer;
  raise notice 'probe 0080 ok';
end $$;
