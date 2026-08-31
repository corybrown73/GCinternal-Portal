-- Invariant probes for the deal-side SOW and logo (0045).
--
-- Both fields reach a customer-facing kickoff deck, which is why a typo in
-- them is worth refusing at the database rather than noticing in the meeting.
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

insert into portal_accounts (id, name, stage)
values ('00000000-0000-4000-8000-00000000d001', 'Probe Deal', 'prospect');

-- A SOW signed next year is a mistyped year, and it prints on a deck the
-- customer reads.
select pg_temp.assert_refused(
  $q$update portal_accounts set sow_signed_date = current_date + 400
      where id = '00000000-0000-4000-8000-00000000d001'$q$,
  'sow_signed_not_future',
  'a SOW signed in the future');

-- Tomorrow is allowed on purpose: signature dates get entered against a
-- countersigning timezone that is legitimately a day ahead.
do $$
begin
  update portal_accounts set sow_signed_date = current_date + 1
   where id = '00000000-0000-4000-8000-00000000d001';
  raise notice 'ok — allowed: a SOW dated tomorrow, which a timezone can produce';
end $$;

select pg_temp.assert_refused(
  $q$update portal_accounts set sow_value = -1
      where id = '00000000-0000-4000-8000-00000000d001'$q$,
  'sow_value_nonneg',
  'a negative contract value');

-- Zero is a real value: a pilot, or a SOW whose commercials sit elsewhere.
do $$
begin
  update portal_accounts set sow_value = 0
   where id = '00000000-0000-4000-8000-00000000d001';
  raise notice 'ok — allowed: a zero-value SOW, which a pilot really is';
end $$;

-- The five SOW columns must be named identically on both sides, because the
-- handoff carry is a copy. A rename on either side breaks it silently.
do $$
declare missing text;
begin
  select string_agg(c, ', ') into missing from unnest(
    array['sow_reference','sow_signed_date','sow_value','sow_document_url','sow_document_name']
  ) c
  where not exists (
    select 1 from information_schema.columns
     where table_name = 'implementations' and column_name = c)
     or not exists (
    select 1 from information_schema.columns
     where table_name = 'portal_accounts' and column_name = c);
  if missing is not null then
    raise exception 'INVARIANT BROKEN: SOW columns not present on both sides: %', missing;
  end if;
  raise notice 'ok — the same five SOW columns exist on the deal and the project';
end $$;

rollback;
