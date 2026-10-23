-- Invariant probes for 0090: a customer login cannot read customer_contacts.
--
-- customer_contacts holds internal assessments of people (`notes`,
-- `is_skeptic`, `comms_preference`). A customer holds a real Supabase session,
-- so what matters is what the `authenticated` role returns to a customer
-- identity. Each check first proves the identity it simulates is the one
-- intended, so a broken simulation cannot pass for a refusal.
-- Runs in one transaction and rolls back. Requires ON_ERROR_STOP=1.

begin;

-- Fixtures ------------------------------------------------------------------
-- People arrive through the real signup path (invites + auth.users insert), so
-- no trigger is disabled and no role guard is bypassed.
insert into customers (id, org_id, name, source, is_test, updated_at) values
  ('c0000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'Probe Customer A', 'manual', false, now()),
  ('c0000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'Probe Customer B', 'manual', false, now());

insert into customer_contacts (id, org_id, customer_id, name, role, email, notes, is_skeptic, comms_preference) values
  ('f0000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000a1', 'Pat Champion', 'champion', 'pat@a.probe.test', 'INTERNAL: will block if pushed on price', true, 'phone'),
  ('f0000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000a2', 'Quinn Other', 'sponsor', 'quinn@b.probe.test', 'INTERNAL: other company', false, 'email');

insert into customer_invites (org_id, email, customer_id, contact_id) values
  ('00000000-0000-4000-8000-000000000001', 'pat@a.probe.test', 'c0000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a1');

insert into portal_user_invites (email, full_name, role, expires_at) values
  ('mgr@probe.test', 'Mo Manager', 'manager', now() + interval '1 day');

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-0000000000c1', 'pat@a.probe.test'),
  ('a0000000-0000-4000-8000-0000000000c2', 'mgr@probe.test');

do $$
begin
  if (select role::text from portal_profiles where id = 'a0000000-0000-4000-8000-0000000000c1') is distinct from 'customer'
     or (select role::text from portal_profiles where id = 'a0000000-0000-4000-8000-0000000000c2') is distinct from 'manager' then
    raise exception 'INVARIANT "fixture roles reach the profile" failed';
  end if;
  if not exists (
    select 1 from customer_users
     where profile_id = 'a0000000-0000-4000-8000-0000000000c1'
       and customer_id = 'c0000000-0000-4000-8000-0000000000a1'
  ) then
    raise exception 'INVARIANT "the customer login is linked to Probe Customer A" failed';
  end if;
  raise notice 'ok — fixture customer and manager arrive through the signup path';
end $$;

-- No policy lets a non-internal role read the table ----------------------------
do $$
declare
  bad text;
begin
  select string_agg(policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public' and tablename = 'customer_contacts'
     and cmd in ('SELECT', 'ALL')
     and policyname <> 'customer_contacts internal select';
  if bad is not null then
    raise exception 'INVARIANT: unexpected SELECT policy on customer_contacts: %', bad;
  end if;
  raise notice 'ok — the only SELECT policy on customer_contacts is the internal one';
end $$;

-- A customer login -------------------------------------------------------------
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000000c1', true);
end $$;
do $$
declare
  n int;
begin
  -- Prove the simulated identity is the customer before reading anything.
  if portal_role()::text is distinct from 'customer' then
    raise exception 'PROBE BROKEN: expected the customer identity, got %', portal_role();
  end if;
  if (select count(*) from customer_users where profile_id = auth.uid()) <> 1 then
    raise exception 'PROBE BROKEN: the customer cannot see their own grant';
  end if;

  select count(*) into n from customer_contacts;
  if n <> 0 then
    raise exception 'INVARIANT: a customer login reads % customer_contacts row(s) directly', n;
  end if;
  select count(*) into n from customer_contacts where notes is not null or is_skeptic;
  if n <> 0 then
    raise exception 'INVARIANT: a customer login reads internal contact notes (% row(s))', n;
  end if;
  raise notice 'ok — a customer login reads no customer_contacts rows';
end $$;
reset role;

-- An internal user still reads and writes contacts ------------------------------
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000000c2', true);
end $$;
do $$
declare
  n int;
begin
  if portal_role()::text is distinct from 'manager' then
    raise exception 'PROBE BROKEN: expected the manager identity, got %', portal_role();
  end if;
  select count(*) into n from customer_contacts;
  if n <> 2 then
    raise exception 'INVARIANT: an internal user lost direct access to customer_contacts (saw % of 2)', n;
  end if;
  update customer_contacts set notes = notes || ' (reviewed)'
   where id = 'f0000000-0000-4000-8000-0000000000a1';
  if not found then
    raise exception 'INVARIANT: an internal user can no longer update customer_contacts';
  end if;
  raise notice 'ok — an internal user still reads and updates customer_contacts';
end $$;
reset role;

-- The server (service role) is unaffected ---------------------------------------
set local role service_role;
do $$
declare
  n int;
begin
  select count(*) into n from customer_contacts;
  if n <> 2 then
    raise exception 'INVARIANT: the service role saw % of 2 customer_contacts rows', n;
  end if;
  raise notice 'ok — the service role still reads customer_contacts';
end $$;
reset role;

-- Anonymous callers get nothing -------------------------------------------------
set local role anon;
do $$
declare
  n int;
begin
  begin
    select count(*) into n from customer_contacts;
  exception when insufficient_privilege then
    n := 0;
  end;
  if n <> 0 then
    raise exception 'INVARIANT: an anonymous caller reads % customer_contacts row(s)', n;
  end if;
  raise notice 'ok — an anonymous caller reads no customer_contacts rows';
end $$;
reset role;

rollback;
