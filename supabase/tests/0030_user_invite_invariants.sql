-- Invariant probes for 0030_user_invites.sql.
--
-- The signup trigger decides what role a brand-new person arrives with. It is
-- the one function in this schema where a mistake hands somebody privileges
-- rather than merely showing them the wrong screen, so its branches are probed
-- directly rather than trusted to review.
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
      raise exception 'INVARIANT "%" was refused, but for the wrong reason. Expected a message containing "%", got: %',
        p_what, p_fragment, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT NOT ENFORCED: % was allowed', p_what;
end $fn$;

-- The allowlist for this transaction: exactly one domain, so an invited address
-- on a DIFFERENT domain is a real test of the exemption.
insert into portal_app_config (key, value)
  values ('allowed_email_domains', '["allowed.test"]'::jsonb)
  on conflict (key) do update set value = '["allowed.test"]'::jsonb;

-- A profile has to exist first, or the trigger's `is_first` branch would make
-- every probe below an admin and prove nothing.
insert into auth.users (id, email) values
  ('00000000-1111-4111-8111-000000000001', 'founder@allowed.test');

-- ---------------------------------------------------------------------------
-- No invite: the allowlist still governs
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused($$
  insert into auth.users (email) values ('stranger@elsewhere.test')
$$, 'approved email domains',
   'an uninvited signup from an unapproved domain');

do $$
declare v_role text;
begin
  insert into auth.users (id, email) values
    ('00000000-1111-4111-8111-000000000002', 'newjoiner@allowed.test');
  select role into v_role from portal_profiles where id = '00000000-1111-4111-8111-000000000002';
  if v_role <> 'sales' then
    raise exception 'INVARIANT NOT ENFORCED: an uninvited on-domain signup should default to sales, got %', v_role;
  end if;
  raise notice 'ok — an uninvited on-domain signup still defaults to sales';
end $$;

-- ---------------------------------------------------------------------------
-- An invite carries the role
-- ---------------------------------------------------------------------------
do $$
declare v_role text;
begin
  insert into portal_user_invites (email, full_name, role)
    values ('lead@allowed.test', 'Invited Lead', 'implementation');
  insert into auth.users (id, email) values
    ('00000000-1111-4111-8111-000000000003', 'lead@allowed.test');

  select role into v_role from portal_profiles where id = '00000000-1111-4111-8111-000000000003';
  if v_role <> 'implementation' then
    raise exception
      'INVARIANT NOT ENFORCED: an invited user should arrive with the invited role, got % instead of implementation',
      v_role;
  end if;
  if not exists (
    select 1 from portal_user_invites
     where email = 'lead@allowed.test' and accepted_at is not null
       and accepted_profile_id = '00000000-1111-4111-8111-000000000003'
  ) then
    raise exception 'INVARIANT NOT ENFORCED: accepting an invite did not mark it accepted';
  end if;
  raise notice 'ok — an invite carries the role and is marked accepted';
end $$;

-- ---------------------------------------------------------------------------
-- An invite stands in for the domain allowlist
-- ---------------------------------------------------------------------------
do $$
declare v_role text;
begin
  insert into portal_user_invites (email, full_name, role)
    values ('contractor@elsewhere.test', 'Contractor', 'tam_se');
  insert into auth.users (id, email) values
    ('00000000-1111-4111-8111-000000000004', 'contractor@elsewhere.test');

  select role into v_role from portal_profiles where id = '00000000-1111-4111-8111-000000000004';
  if v_role <> 'tam_se' then
    raise exception
      'INVARIANT NOT ENFORCED: a named invite should admit an off-domain address, got %', v_role;
  end if;
  raise notice 'ok — a named invite admits an address the domain allowlist would refuse';
end $$;

-- ---------------------------------------------------------------------------
-- An EXPIRED invite does not
-- ---------------------------------------------------------------------------
-- The whole point of the expiry: an invite left open is a standing offer of a
-- staff account to whoever ends up with that mailbox.
insert into portal_user_invites (email, full_name, role, created_at, expires_at)
  values ('stale@elsewhere.test', 'Stale', 'manager', now() - interval '30 days', now() - interval '1 day');

select pg_temp.assert_refused($$
  insert into auth.users (email) values ('stale@elsewhere.test')
$$, 'approved email domains',
   'signing up on an expired invite from an unapproved domain');

-- ---------------------------------------------------------------------------
-- An ACCEPTED invite cannot be reused
-- ---------------------------------------------------------------------------
-- One invite must not become a permanent grant of `implementation` to whoever
-- can receive mail at that address.
--
-- The obvious probe — sign up twice on one address — is unreachable:
-- portal_profiles.email is unique, so a second profile on that address cannot
-- exist at all. That is a stronger guarantee than the one being tested, and it
-- is worth writing down rather than leaving a future reader to rediscover.
--
-- The reachable case is the account being removed and the address later
-- re-registered. The invite row survives that (it is marked accepted, and
-- accepted_profile_id nulls out), so what matters is that it is not honoured a
-- second time.
do $$
declare v_role text;
begin
  delete from auth.users where id = '00000000-1111-4111-8111-000000000003';
  delete from portal_profiles where id = '00000000-1111-4111-8111-000000000003';

  insert into auth.users (id, email) values
    ('00000000-1111-4111-8111-000000000005', 'lead@allowed.test');
  select role into v_role from portal_profiles where id = '00000000-1111-4111-8111-000000000005';
  if v_role <> 'sales' then
    raise exception
      'INVARIANT NOT ENFORCED: an already-accepted invite was redeemed again, granting % a second time',
      v_role;
  end if;
  raise notice 'ok — an accepted invite is not honoured a second time';
end $$;

-- ---------------------------------------------------------------------------
-- A customer invite outranks a staff invite
-- ---------------------------------------------------------------------------
-- The narrower, less privileged answer wins when an address holds both.
do $$
declare
  v_role text;
  v_customer uuid := '00000000-2222-4222-8222-000000000001';
begin
  insert into customers (id, name) values (v_customer, 'Probe Customer');
  insert into customer_invites (email, customer_id) values ('both@elsewhere.test', v_customer);
  insert into portal_user_invites (email, role) values ('both@elsewhere.test', 'super_admin');
  insert into auth.users (id, email) values
    ('00000000-1111-4111-8111-000000000006', 'both@elsewhere.test');

  select role into v_role from portal_profiles where id = '00000000-1111-4111-8111-000000000006';
  if v_role <> 'customer' then
    raise exception
      'INVARIANT NOT ENFORCED: an address holding both invites became %, not customer', v_role;
  end if;
  raise notice 'ok — a customer invite outranks a staff invite';
end $$;

-- ---------------------------------------------------------------------------
-- Shape constraints
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused($$
  insert into portal_user_invites (email, role) values ('someone@allowed.test', 'customer')
$$, 'role_check',
   'inviting somebody as a customer through the staff table');

select pg_temp.assert_refused($$
  insert into portal_user_invites (email, role) values ('Mixed.Case@allowed.test', 'sales')
$$, 'email_shape',
   'an invite whose email is not already lowercased');

select pg_temp.assert_refused($$
  insert into portal_user_invites (email, role) values ('not-an-email', 'sales')
$$, 'email_shape',
   'an invite to something that is not an email address');

select pg_temp.assert_refused($$
  insert into portal_user_invites (email, role, expires_at)
  values ('past@allowed.test', 'sales', now() - interval '1 day')
$$, 'expiry_check',
   'an invite that has already expired when written');

-- Re-inviting somebody updates the existing row rather than making a second
-- one, so "who invited them, as what" has exactly one answer.
insert into portal_user_invites (email, role) values ('twice@allowed.test', 'sales');
select pg_temp.assert_refused($$
  insert into portal_user_invites (email, role) values ('twice@allowed.test', 'manager')
$$, 'duplicate key',
   'a second PENDING invite to one address');

-- But an ACCEPTED invite does not block a new one: somebody who left and came
-- back has to be invitable again. The unique index is partial for this reason.
do $$
begin
  update portal_user_invites set accepted_at = now() where email = 'twice@allowed.test';
  insert into portal_user_invites (email, role) values ('twice@allowed.test', 'manager');
  raise notice 'ok — an accepted invite does not block re-inviting the same person';
exception when others then
  raise exception 'LEGITIMATE OPERATION REFUSED: re-inviting after acceptance — %', sqlerrm;
end $$;

rollback;
