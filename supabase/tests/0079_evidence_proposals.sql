-- Probe for 0079: a proposal can be kept for an implementation, reads back
-- pending, can be marked applied with the entity it created, and goes with
-- its implementation. Nothing is left behind.
do $$
declare
  v_customer uuid;
  v_impl uuid;
  v_proposal uuid;
  v_status text;
  v_entity uuid := gen_random_uuid();
begin
  insert into customers (name) values ('probe 0079 customer') returning id into v_customer;
  insert into implementations (customer_id, name, current_stage)
  values (v_customer, 'probe 0079 implementation', 'kickoff')
  returning id into v_impl;

  insert into evidence_proposals (implementation_id, type, title, text, quote, confidence, severity)
  values (v_impl, 'risk', 'probe risk', 'The crew has no tablets yet', 'we still have no tablets', 'stated', 'high')
  returning id into v_proposal;

  select status into v_status from evidence_proposals where id = v_proposal;
  if v_status is distinct from 'pending' then
    raise exception '0079: a new proposal did not read back pending (got %)', v_status;
  end if;

  begin
    insert into evidence_proposals (implementation_id, type, title)
    values (v_impl, 'stage_change', 'not allowed');
    raise exception '0079: a proposal of an unknown type was accepted';
  exception when check_violation then
    null;
  end;

  update evidence_proposals
     set status = 'applied', applied_entity_type = 'risk', applied_entity_id = v_entity,
         decided_at = now()
   where id = v_proposal;
  if not exists (
    select 1 from evidence_proposals
     where id = v_proposal and status = 'applied' and applied_entity_id = v_entity
       and updated_at >= created_at
  ) then
    raise exception '0079: the applied proposal did not keep its entity';
  end if;

  delete from evidence_proposals where id = v_proposal;

  -- Cascade: deleting the customer takes the implementation and its proposals.
  insert into evidence_proposals (implementation_id, type, title)
  values (v_impl, 'note', 'probe note');
  delete from customers where id = v_customer;
  if exists (select 1 from evidence_proposals where implementation_id = v_impl) then
    raise exception '0079: proposals survived the implementation delete';
  end if;

  raise notice 'probe 0079 ok';
end $$;
