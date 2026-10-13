-- Probe for 0085: a new deal and a new customer are real by default, either
-- can be flagged, and the flag cannot be null. Nothing is left behind.
do $$
declare
  v_customer uuid := gen_random_uuid();
  v_deal uuid := gen_random_uuid();
  v_flag boolean;
begin
  insert into customers (id, name) values (v_customer, 'Probe 0085 customer');
  insert into portal_accounts (id, name, stage, customer_id)
  values (v_deal, 'Probe 0085 deal', 'prospect', v_customer);

  select is_test into v_flag from customers where id = v_customer;
  if v_flag is distinct from false then
    raise exception '0085: a new customer is not real by default (is_test = %)', v_flag;
  end if;
  select is_test into v_flag from portal_accounts where id = v_deal;
  if v_flag is distinct from false then
    raise exception '0085: a new deal is not real by default (is_test = %)', v_flag;
  end if;

  update portal_accounts set is_test = true where id = v_deal;
  update customers set is_test = true where id = v_customer;
  if not exists (select 1 from portal_accounts where id = v_deal and is_test)
     or not exists (select 1 from customers where id = v_customer and is_test) then
    raise exception '0085: the test flag did not stick';
  end if;

  begin
    update portal_accounts set is_test = null where id = v_deal;
    raise exception '0085: a null test flag was accepted';
  exception when not_null_violation then
    null;
  end;

  delete from portal_accounts where id = v_deal;
  delete from customers where id = v_customer;
  raise notice 'probe 0085 ok';
end $$;
