-- Probe for 0078: a job can be queued for a deal, a second active job for
-- the same deal is refused by the partial unique index, a reading can be
-- stored and found by its hash. Nothing is left behind.
do $$
declare
  v_account uuid;
  v_job uuid;
begin
  insert into portal_accounts (name, stage)
  values ('probe 0078 account', 'closed_won')
  returning id into v_account;

  insert into portal_ai_jobs (kind, deal_id, trigger)
  values ('prepare_deal', v_account, 'probe')
  returning id into v_job;

  begin
    insert into portal_ai_jobs (kind, deal_id, trigger)
    values ('prepare_deal', v_account, 'probe again');
    raise exception '0078: a second queued job for the same deal was accepted';
  exception when unique_violation then
    null;
  end;

  -- Once the first is done, a new one may be queued.
  update portal_ai_jobs set status = 'done', finished_at = now() where id = v_job;
  insert into portal_ai_jobs (kind, deal_id, trigger)
  values ('prepare_deal', v_account, 'probe rerun');

  insert into portal_ai_readings (deal_id, kind, source_hash, output)
  values (v_account, 'sow', 'probe-hash', '{"readable": true}'::jsonb);
  if not exists (
    select 1 from portal_ai_readings
     where deal_id = v_account and kind = 'sow' and source_hash = 'probe-hash'
  ) then
    raise exception '0078: the reading was not found by its hash';
  end if;

  -- Cascade: deleting the account takes the jobs and the reading with it.
  delete from portal_accounts where id = v_account;
  if exists (select 1 from portal_ai_jobs where deal_id = v_account)
     or exists (select 1 from portal_ai_readings where deal_id = v_account) then
    raise exception '0078: rows survived the account delete';
  end if;

  raise notice 'probe 0078 ok';
end $$;
