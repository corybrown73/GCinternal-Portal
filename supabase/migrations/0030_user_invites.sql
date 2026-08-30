-- 0030 — Adding a teammate becomes something you can do.
--
-- THE GAP. There was no way to add an internal user. The only route in was
-- self-signup at /signup with an email on the `allowed_email_domains` list,
-- which landed the person as `sales` regardless of what they actually do, after
-- which an admin had to notice and fix the role. Nobody outside the team could
-- be added at all, and nobody could be given the right role on arrival.
--
-- Customers have had a working invite since 0005: `customer_invites`, which the
-- signup trigger reads to assign the right role and links. This gives internal
-- people the same thing, and deliberately reuses that shape rather than
-- inventing a second one — the trigger below is the SAME trigger, extended.
--
-- TWO DECISIONS WORTH ARGUING WITH.
--
-- 1. An invite EXEMPTS the email from the domain allowlist, exactly as a
--    customer invite already does. A named admin typing a specific address is a
--    stronger and more accountable signal than "anyone at this domain may sign
--    up" — and the contractor, the partner SE and the new hire whose company
--    address is not live yet are all real. The allowlist keeps doing its job for
--    UNINVITED signups, which is the case it was written for.
--
-- 2. The invited ROLE is applied at signup, not afterwards. Applying it
--    afterwards would need the role-change guard to accept a service-role
--    write, which would weaken `portal_guard_role_change` for every path — and
--    that guard is the reason a compromised service key cannot make itself an
--    admin. The invite row carries the role, the trigger reads it, the guard
--    never moves.
--
-- Rollback: supabase/down/0030_down.sql

create table portal_user_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  email text not null,
  full_name text,

  -- The role they arrive as. Constrained to the roles the admin UI offers:
  -- 'customer' is deliberately absent, because a customer arrives through
  -- customer_invites with an account link, and one that came through here would
  -- be a customer-role profile attached to no customer at all.
  role portal_user_role not null default 'sales',

  invited_by uuid references portal_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Invites expire. An invite left open for a year is a standing offer of a
  -- staff account to whoever ends up with that mailbox.
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_profile_id uuid references portal_profiles (id) on delete set null,

  constraint portal_user_invites_email_shape
    check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint portal_user_invites_role_check
    check (role in ('super_admin', 'manager', 'sales', 'implementation', 'tam_se')),
  constraint portal_user_invites_expiry_check
    check (expires_at > created_at)
);

-- One live invite per address. Re-inviting somebody updates the row rather than
-- making a second one, so "who invited them, as what" has one answer.
create unique index portal_user_invites_pending_idx
  on portal_user_invites (email) where accepted_at is null;
create index portal_user_invites_accepted_idx
  on portal_user_invites (accepted_at desc) where accepted_at is not null;

comment on table portal_user_invites is
  'Pending internal-staff invites. Read by portal_handle_new_user at signup to '
  'assign the invited role and to exempt the address from allowed_email_domains.';

alter table portal_user_invites enable row level security;

-- Only admins. `portal_can_manage()` would include managers, and an invite is
-- how somebody becomes staff — that is an admin decision, and the app layer
-- gates it to super admins on top of this.
create policy "user invites admin" on portal_user_invites
  for all to authenticated using (portal_is_admin()) with check (portal_is_admin());

grant select, insert, update, delete on portal_user_invites to service_role;

-- ---------------------------------------------------------------------------
-- The signup trigger, extended
-- ---------------------------------------------------------------------------
-- Unchanged from 0011 except for the new middle branch. Reproduced whole rather
-- than patched because `create or replace function` has no other form, and a
-- reader comparing this against 0011 should be able to see the entire body.
--
-- Order matters and is deliberate: customer invite, then staff invite, then the
-- domain allowlist. An address holding both kinds of invite is a customer — the
-- narrower, less privileged answer.
create or replace function portal_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  allowed jsonb;
  dom text;
  is_first boolean;
  inv record;
  has_invite boolean;
  staff record;
begin
  select exists (
    select 1 from customer_invites where lower(email) = lower(new.email)
  ) into has_invite;

  if has_invite then
    insert into portal_profiles (id, email, full_name, role)
    values (
      new.id,
      lower(new.email),
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      'customer'::portal_user_role
    );
    for inv in
      select * from customer_invites where lower(email) = lower(new.email)
    loop
      insert into customer_users (org_id, profile_id, customer_id, contact_id, implementation_id)
      values (inv.org_id, new.id, inv.customer_id, inv.contact_id, inv.implementation_id)
      on conflict do nothing;
    end loop;
    update customer_invites
      set accepted_at = now()
      where lower(email) = lower(new.email) and accepted_at is null;
    return new;
  end if;

  -- NEW: an internal invite. Carries the role, and stands in for the domain
  -- allowlist — see decision 1 in the header.
  select * into staff
    from portal_user_invites
   where email = lower(new.email)
     and accepted_at is null
     and expires_at > now()
   limit 1;

  if found then
    insert into portal_profiles (id, email, full_name, role)
    values (
      new.id,
      lower(new.email),
      -- What they typed at signup wins over what the admin guessed, because
      -- they know their own name; the invite's name is the fallback.
      coalesce(
        nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
        staff.full_name,
        ''
      ),
      staff.role
    );
    update portal_user_invites
       set accepted_at = now(), accepted_profile_id = new.id
     where id = staff.id;
    return new;
  end if;

  select value into allowed from portal_app_config where key = 'allowed_email_domains';
  dom := lower(split_part(new.email, '@', 2));
  if allowed is null or not (allowed ? dom) then
    raise exception 'Signups are restricted to approved email domains';
  end if;
  select not exists (select 1 from portal_profiles) into is_first;
  insert into portal_profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when is_first then 'admin'::portal_user_role else 'sales'::portal_user_role end
  );
  return new;
end $$;
