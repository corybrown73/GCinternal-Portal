-- Invariant probe for 0049: a shown link cannot exist without its hash.
begin;
create function pg_temp.assert_refused(p_sql text, p_fragment text, p_what text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'INVARIANT "%" refused for the wrong reason: %', p_what, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT NOT ENFORCED: % was allowed', p_what;
end $fn$;

insert into portal_accounts (id, name) values ('00000000-0000-4000-8000-00000000a009', 'Probe');

select pg_temp.assert_refused(
  $q$update portal_accounts set welcome_share_url = 'https://x/welcome/t' where id = '00000000-0000-4000-8000-00000000a009'$q$,
  'portal_accounts_welcome_url_with_hash',
  'a shown link with no hash behind it');

update portal_accounts set welcome_token_hash = 'h', welcome_issued_at = now(), welcome_share_url = 'https://x/welcome/t'
  where id = '00000000-0000-4000-8000-00000000a009';
rollback;
