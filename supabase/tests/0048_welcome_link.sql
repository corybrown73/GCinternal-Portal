-- Invariant probes for the welcome link (0048).
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

-- Two deals to work with.
insert into portal_accounts (id, name) values
  ('00000000-0000-4000-8000-00000000a001', 'Probe One'),
  ('00000000-0000-4000-8000-00000000a002', 'Probe Two');

-- A token without an issue time is refused; with one it is allowed.
select pg_temp.assert_refused(
  $q$update portal_accounts set welcome_token_hash = 'abc' where id = '00000000-0000-4000-8000-00000000a001'$q$,
  'portal_accounts_welcome_issued_with_token',
  'a welcome token with no issue time');

update portal_accounts set welcome_token_hash = 'abc', welcome_issued_at = now()
  where id = '00000000-0000-4000-8000-00000000a001';

-- Two deals can never hold the same link.
select pg_temp.assert_refused(
  $q$update portal_accounts set welcome_token_hash = 'abc', welcome_issued_at = now()
     where id = '00000000-0000-4000-8000-00000000a002'$q$,
  'portal_accounts_welcome_token_hash_uq',
  'the same welcome token on two deals');

-- But two deals with no link at all are fine (the partial index).
update portal_accounts set welcome_token_hash = null where id = '00000000-0000-4000-8000-00000000a001';
do $$
begin
  if (select count(*) from portal_accounts where welcome_token_hash is null
        and id in ('00000000-0000-4000-8000-00000000a001','00000000-0000-4000-8000-00000000a002')) <> 2 then
    raise exception 'INVARIANT: clearing a token should leave both rows without one';
  end if;
  raise notice 'ok — nulls do not collide';
end $$;

-- Homework must be an object: an array is refused, an object with a tick is allowed.
select pg_temp.assert_refused(
  $q$update portal_accounts set welcome_homework = '[]'::jsonb where id = '00000000-0000-4000-8000-00000000a001'$q$,
  'portal_accounts_welcome_homework_is_object',
  'homework stored as an array');

update portal_accounts set welcome_homework = '{"app": "2026-09-10T12:00:00Z"}'::jsonb
  where id = '00000000-0000-4000-8000-00000000a001';

rollback;
