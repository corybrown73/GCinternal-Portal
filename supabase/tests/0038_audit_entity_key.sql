-- Invariant probes for audit rows on text-keyed entities (0038).
--
-- The failure this guards is not "the column is missing". It is that a write
-- which SHOULD be recorded gets refused by the database, the helper retries,
-- and the user is shown a Critical alert while the page they are on tells them
-- the change was recorded against their name. Three of those were sitting open
-- in /alerts when this was found, and the audit trail for every feature-flag
-- change ever made was empty.
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

-- ---------------------------------------------------------------------------
-- A flag toggle can be recorded at all
-- ---------------------------------------------------------------------------
do $$
declare v_key text;
begin
  insert into portal_audit_log (actor_type, action, entity_type, entity_key, payload)
  values ('user', 'flag.disabled', 'feature_flag', 'trace_links_editing',
          '{"flag":"trace_links_editing","value":false}'::jsonb)
  returning entity_key into v_key;

  if v_key is null then
    raise exception 'INVARIANT NOT ENFORCED: the flag key was not recorded';
  end if;
  raise notice 'ok — a text-keyed entity can be audited (%)', v_key;
end $$;

-- ...and is findable by key, which is the reason it is a column rather than a
-- field buried in the payload.
do $$
declare n int;
begin
  select count(*) into n from portal_audit_log
   where entity_type = 'feature_flag' and entity_key = 'trace_links_editing';
  if n < 1 then
    raise exception 'INVARIANT NOT ENFORCED: the flag audit row is not findable by key';
  end if;
  raise notice 'ok — "every change to this flag" is an indexed lookup';
end $$;

-- ---------------------------------------------------------------------------
-- Never both
-- ---------------------------------------------------------------------------
-- A row naming the changed thing twice gives two answers to one question, and
-- nothing downstream has a rule for which to believe.
select pg_temp.assert_refused(
  $q$insert into portal_audit_log (actor_type, action, entity_type, entity_id, entity_key)
     values ('user', 'flag.enabled', 'feature_flag',
             'd5200000-0000-4000-8000-000000000001', 'demo_mode')$q$,
  'portal_audit_log_one_entity_ref',
  'an audit row that names both a uuid and a key');

-- An event about nothing is legitimate — a sign-in names no entity — so the
-- constraint must forbid only the ambiguous case, not the empty one.
do $$
begin
  insert into portal_audit_log (actor_type, action)
    values ('user', 'auth.signin');
  raise notice 'ok — an event about no particular entity is still allowed';
end $$;

-- ---------------------------------------------------------------------------
-- The original failure, pinned
-- ---------------------------------------------------------------------------
-- If a later change ever points entity_id at text, this is the message that
-- reached the user, and it must come back.
select pg_temp.assert_refused(
  $q$insert into portal_audit_log (actor_type, action, entity_type, entity_id)
     values ('user', 'flag.enabled', 'feature_flag', 'trace_links_editing')$q$,
  'invalid input syntax for type uuid',
  'a text key written into the uuid column');

rollback;
