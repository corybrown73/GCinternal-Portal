-- Invariant probes for the deal ↔ implementation link (0041).
--
-- Two things have to hold. The link must survive the deletion of the deal it
-- points at — provenance is worth less than the delivery work, and a cascade
-- here would delete a live project because somebody tidied the pipeline. And
-- the backfill must only claim a pairing where there is exactly one thing it
-- can mean.
--
-- Runs inside one transaction and rolls back. Requires ON_ERROR_STOP=1.

begin;

create function pg_temp.assert_refused(p_sql text, p_fragment text, p_what text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'INVARIANT "%" was refused, but for the wrong reason. Expected "%", got: %',
        p_what, p_fragment, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT NOT ENFORCED: % was allowed', p_what;
end $fn$;

insert into customers (id, name) values
  ('41000000-0000-4000-8000-000000000001', 'Deal Link Probe Co');

insert into portal_accounts (id, name, customer_id) values
  ('41000000-0000-4000-8000-000000000010', 'Deal Link Probe deal',
   '41000000-0000-4000-8000-000000000001');

insert into implementations (id, customer_id, name, current_stage, deal_id) values
  ('41000000-0000-4000-8000-000000000020',
   '41000000-0000-4000-8000-000000000001',
   'Deal Link Probe project', 'handoff',
   '41000000-0000-4000-8000-000000000010');

-- ---------------------------------------------------------------------------
-- Deleting the deal must not delete the project
-- ---------------------------------------------------------------------------
-- The whole reason this is SET NULL. A CASCADE here would mean somebody
-- clearing out old pipeline records silently destroys live delivery work, and
-- the first anyone knows is a customer asking where their plan went.
do $$
declare v_deal uuid; v_alive boolean;
begin
  delete from portal_accounts where id = '41000000-0000-4000-8000-000000000010';

  select deal_id, true into v_deal, v_alive
    from implementations where id = '41000000-0000-4000-8000-000000000020';

  if v_alive is not true then
    raise exception 'INVARIANT VIOLATED: deleting the deal deleted the implementation';
  end if;
  if v_deal is not null then
    raise exception 'INVARIANT VIOLATED: deal_id still points at a deleted deal (%)', v_deal;
  end if;
  raise notice 'ok — the project outlives its deal, and the link nulls out';
end $$;

-- ---------------------------------------------------------------------------
-- A deal_id must name a real deal
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused(
  $q$update implementations
        set deal_id = '41000000-0000-4000-8000-0000000000ff'
      where id = '41000000-0000-4000-8000-000000000020'$q$,
  'foreign key constraint',
  'an implementation pointed at a deal that does not exist');

-- ---------------------------------------------------------------------------
-- No deal is the ordinary case
-- ---------------------------------------------------------------------------
-- Most projects predate the link and some never have a deal at all — an
-- expansion agreed on a call, a migration the TIS opened themselves. A NOT NULL
-- here would have been answered with whatever deal was nearest.
do $$
begin
  insert into implementations (customer_id, name, current_stage)
  values ('41000000-0000-4000-8000-000000000001', 'No deal at all', 'handoff');
  raise notice 'ok — a project with no deal is still a project';
end $$;

rollback;
