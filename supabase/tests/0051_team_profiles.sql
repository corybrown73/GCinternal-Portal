-- Invariant probes for team profiles (0051).
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

-- element. Rolled back with everything else; the real allowlist is untouched.
insert into portal_app_config (key, value)
  values ('allowed_email_domains', '["invariants.test"]'::jsonb)
  on conflict (key) do update set value =
    case when portal_app_config.value ? 'invariants.test'
         then portal_app_config.value
         else portal_app_config.value || '["invariants.test"]'::jsonb end;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000c001', 'probe-c@invariants.test');
insert into portal_profiles (id, email, full_name)
  values ('00000000-0000-4000-8000-00000000c001', 'probe-c@invariants.test', 'Probe C')
  on conflict (id) do nothing;

-- A booking link is https or nothing.
select pg_temp.assert_refused(
  $q$update portal_profiles set booking_url = 'http://calendly.com/x' where id = '00000000-0000-4000-8000-00000000c001'$q$,
  'booking_url_check', 'a plain-http booking link');
select pg_temp.assert_refused(
  $q$update portal_profiles set booking_url = 'javascript:alert(1)' where id = '00000000-0000-4000-8000-00000000c001'$q$,
  'booking_url_check', 'a javascript booking link');
update portal_profiles set booking_url = 'https://calendly.com/cory/30min', title = 'Implementation Specialist'
  where id = '00000000-0000-4000-8000-00000000c001';

-- A title stays a title.
select pg_temp.assert_refused(
  $q$update portal_profiles set title = repeat('x', 81) where id = '00000000-0000-4000-8000-00000000c001'$q$,
  'title_check', 'an 81-character title');
rollback;
