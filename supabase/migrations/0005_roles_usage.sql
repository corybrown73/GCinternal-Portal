-- 0005 — Use the new role values: helper functions, customer linkage tables,
-- signup-trigger update, and per-role RLS tightening.
-- (Separate file from 0004 because new enum values cannot be used in the same
-- transaction that created them.)

-- ---------------------------------------------------------------------------
-- Role helper functions
-- ---------------------------------------------------------------------------
create or replace function portal_role()
returns portal_user_role
language sql stable
security definer set search_path = public
as $$
  select role from portal_profiles where id = auth.uid();
$$;

create or replace function portal_is_super_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select coalesce(portal_role() in ('admin', 'super_admin'), false);
$$;

create or replace function portal_is_internal()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select portal_role() is not null and portal_role() <> 'customer';
$$;

create or replace function portal_can_manage()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select coalesce(portal_role() in ('admin', 'super_admin', 'manager'), false);
$$;

revoke execute on function portal_role() from public, anon;
revoke execute on function portal_is_super_admin() from public, anon;
revoke execute on function portal_is_internal() from public, anon;
revoke execute on function portal_can_manage() from public, anon;
grant execute on function portal_role() to authenticated;
grant execute on function portal_is_super_admin() to authenticated;
grant execute on function portal_is_internal() to authenticated;
grant execute on function portal_can_manage() to authenticated;

-- New internal signups default to 'sales' (was 'am').
alter table portal_profiles alter column role set default 'sales';

-- ---------------------------------------------------------------------------
-- Customer login linkage
-- ---------------------------------------------------------------------------
create table customer_users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  profile_id uuid not null references portal_profiles (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  contact_id uuid references customer_contacts (id) on delete set null,
  created_at timestamptz default now(),
  unique (profile_id, customer_id)
);

alter table customer_users enable row level security;
create policy "customer_users self or internal select" on customer_users
  for select to authenticated
  using (profile_id = auth.uid() or portal_is_internal());

create table customer_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  email text not null,
  customer_id uuid not null references customers (id) on delete cascade,
  contact_id uuid references customer_contacts (id),
  invited_by uuid references portal_profiles (id),
  created_at timestamptz default now(),
  accepted_at timestamptz,
  unique (email, customer_id)
);

alter table customer_invites enable row level security;
create policy "customer_invites internal select" on customer_invites
  for select to authenticated using (portal_is_internal());
create policy "customer_invites internal insert" on customer_invites
  for insert to authenticated with check (portal_is_internal());
create policy "customer_invites internal update" on customer_invites
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
create policy "customer_invites internal delete" on customer_invites
  for delete to authenticated using (portal_is_internal());

-- ---------------------------------------------------------------------------
-- Signup trigger: invited customer emails become 'customer' profiles linked to
-- their customers (skipping the domain allowlist); everyone else keeps the
-- 0001 behavior — domain allowlist + first-user-becomes-admin.
-- ---------------------------------------------------------------------------
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
begin
  select exists (
    select 1 from customer_invites where lower(email) = lower(new.email)
  ) into has_invite;

  if has_invite then
    -- Invited customer: no domain-allowlist check, role 'customer', link to
    -- every invited customer and stamp the invites accepted.
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
      insert into customer_users (org_id, profile_id, customer_id, contact_id)
      values (inv.org_id, new.id, inv.customer_id, inv.contact_id)
      on conflict (profile_id, customer_id) do nothing;
    end loop;
    update customer_invites
      set accepted_at = now()
      where lower(email) = lower(new.email) and accepted_at is null;
    return new;
  end if;

  -- Existing behavior from 0001 (role literal updated 'am' -> 'sales' to match
  -- the new default).
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
end;
$$;

-- 0002 revoked execute on the old signature; re-assert for the replaced body.
revoke execute on function portal_handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tighten RLS on the six customer-visible tables: internal select + scoped
-- customer select; writes stay internal-only.
-- ---------------------------------------------------------------------------

-- customers (customer scope: the row's own id)
drop policy "customers select" on customers;
drop policy "customers insert" on customers;
drop policy "customers update" on customers;
drop policy "customers delete" on customers;
create policy "customers internal select" on customers
  for select to authenticated using (portal_is_internal());
create policy "customers customer select" on customers
  for select to authenticated
  using (exists (
    select 1 from customer_users cu
    where cu.profile_id = auth.uid() and cu.customer_id = customers.id
  ));
create policy "customers internal insert" on customers
  for insert to authenticated with check (portal_is_internal());
create policy "customers internal update" on customers
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
create policy "customers internal delete" on customers
  for delete to authenticated using (portal_is_internal());

-- implementations (customer scope: customer_id column)
drop policy "implementations select" on implementations;
drop policy "implementations insert" on implementations;
drop policy "implementations update" on implementations;
drop policy "implementations delete" on implementations;
create policy "implementations internal select" on implementations
  for select to authenticated using (portal_is_internal());
create policy "implementations customer select" on implementations
  for select to authenticated
  using (exists (
    select 1 from customer_users cu
    where cu.profile_id = auth.uid() and cu.customer_id = implementations.customer_id
  ));
create policy "implementations internal insert" on implementations
  for insert to authenticated with check (portal_is_internal());
create policy "implementations internal update" on implementations
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
create policy "implementations internal delete" on implementations
  for delete to authenticated using (portal_is_internal());

-- customer_contacts (customer scope: customer_id column)
drop policy "customer_contacts select" on customer_contacts;
drop policy "customer_contacts insert" on customer_contacts;
drop policy "customer_contacts update" on customer_contacts;
drop policy "customer_contacts delete" on customer_contacts;
create policy "customer_contacts internal select" on customer_contacts
  for select to authenticated using (portal_is_internal());
create policy "customer_contacts customer select" on customer_contacts
  for select to authenticated
  using (exists (
    select 1 from customer_users cu
    where cu.profile_id = auth.uid() and cu.customer_id = customer_contacts.customer_id
  ));
create policy "customer_contacts internal insert" on customer_contacts
  for insert to authenticated with check (portal_is_internal());
create policy "customer_contacts internal update" on customer_contacts
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
create policy "customer_contacts internal delete" on customer_contacts
  for delete to authenticated using (portal_is_internal());

-- milestones (customer scope: via implementation's customer_id)
drop policy "milestones select" on milestones;
drop policy "milestones insert" on milestones;
drop policy "milestones update" on milestones;
drop policy "milestones delete" on milestones;
create policy "milestones internal select" on milestones
  for select to authenticated using (portal_is_internal());
create policy "milestones customer select" on milestones
  for select to authenticated
  using (exists (
    select 1
    from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = milestones.implementation_id and cu.profile_id = auth.uid()
  ));
create policy "milestones internal insert" on milestones
  for insert to authenticated with check (portal_is_internal());
create policy "milestones internal update" on milestones
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
create policy "milestones internal delete" on milestones
  for delete to authenticated using (portal_is_internal());

-- commitments (customer scope: via implementation's customer_id)
drop policy "commitments select" on commitments;
drop policy "commitments insert" on commitments;
drop policy "commitments update" on commitments;
drop policy "commitments delete" on commitments;
create policy "commitments internal select" on commitments
  for select to authenticated using (portal_is_internal());
create policy "commitments customer select" on commitments
  for select to authenticated
  using (exists (
    select 1
    from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = commitments.implementation_id and cu.profile_id = auth.uid()
  ));
create policy "commitments internal insert" on commitments
  for insert to authenticated with check (portal_is_internal());
create policy "commitments internal update" on commitments
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
create policy "commitments internal delete" on commitments
  for delete to authenticated using (portal_is_internal());

-- success_criteria (customer scope: via implementation's customer_id)
drop policy "success_criteria select" on success_criteria;
drop policy "success_criteria insert" on success_criteria;
drop policy "success_criteria update" on success_criteria;
drop policy "success_criteria delete" on success_criteria;
create policy "success_criteria internal select" on success_criteria
  for select to authenticated using (portal_is_internal());
create policy "success_criteria customer select" on success_criteria
  for select to authenticated
  using (exists (
    select 1
    from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = success_criteria.implementation_id and cu.profile_id = auth.uid()
  ));
create policy "success_criteria internal insert" on success_criteria
  for insert to authenticated with check (portal_is_internal());
create policy "success_criteria internal update" on success_criteria
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
create policy "success_criteria internal delete" on success_criteria
  for delete to authenticated using (portal_is_internal());

-- ---------------------------------------------------------------------------
-- All other 0003 tables: replace coarse using(true) with portal_is_internal().
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'orgs','team_members','adoption_areas','evidence','adoption_observations',
    'approvals','audit_log','cs_handoffs','decisions','issues','risks',
    'escalations','graduations','implementation_stage_history',
    'journal_entries','requirements','requirement_scope_changes',
    'success_criteria_observations','technical_solutions',
    'technical_solution_notes','field_mappings','trace_links'
  ] loop
    execute format('drop policy "%s select" on %I', t, t);
    execute format('drop policy "%s insert" on %I', t, t);
    execute format('drop policy "%s update" on %I', t, t);
    execute format('drop policy "%s delete" on %I', t, t);
    execute format(
      'create policy "%s internal select" on %I for select to authenticated using (portal_is_internal())', t, t);
    execute format(
      'create policy "%s internal insert" on %I for insert to authenticated with check (portal_is_internal())', t, t);
    execute format(
      'create policy "%s internal update" on %I for update to authenticated using (portal_is_internal()) with check (portal_is_internal())', t, t);
    execute format(
      'create policy "%s internal delete" on %I for delete to authenticated using (portal_is_internal())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Pre-existing portal_ tables: customer logins must not read internal sales
-- data. Drop the using(true) selects and recreate as internal-only; write
-- policies keep their 0001 clauses AND-ed with portal_is_internal().
-- ---------------------------------------------------------------------------

-- portal_app_config
drop policy "config readable" on portal_app_config;
create policy "config readable" on portal_app_config
  for select to authenticated using (portal_is_internal());
drop policy "config admin write" on portal_app_config;
create policy "config admin write" on portal_app_config
  for update to authenticated
  using (portal_is_admin() and portal_is_internal())
  with check (portal_is_admin() and portal_is_internal());

-- portal_accounts
drop policy "accounts readable" on portal_accounts;
create policy "accounts readable" on portal_accounts
  for select to authenticated using (portal_is_internal());
drop policy "accounts insert" on portal_accounts;
create policy "accounts insert" on portal_accounts
  for insert to authenticated with check (portal_is_internal());
drop policy "accounts update" on portal_accounts;
create policy "accounts update" on portal_accounts
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
drop policy "accounts admin delete" on portal_accounts;
create policy "accounts admin delete" on portal_accounts
  for delete to authenticated using (portal_is_admin() and portal_is_internal());

-- portal_stage_transitions (writes go through the definer function only)
drop policy "transitions readable" on portal_stage_transitions;
create policy "transitions readable" on portal_stage_transitions
  for select to authenticated using (portal_is_internal());

-- portal_gong_reports
drop policy "gong readable" on portal_gong_reports;
create policy "gong readable" on portal_gong_reports
  for select to authenticated using (portal_is_internal());
drop policy "gong insert" on portal_gong_reports;
create policy "gong insert" on portal_gong_reports
  for insert to authenticated
  with check (uploaded_by = auth.uid() and portal_is_internal());
drop policy "gong delete own or admin" on portal_gong_reports;
create policy "gong delete own or admin" on portal_gong_reports
  for delete to authenticated
  using ((uploaded_by = auth.uid() or portal_is_admin()) and portal_is_internal());

-- portal_briefs
drop policy "briefs readable" on portal_briefs;
create policy "briefs readable" on portal_briefs
  for select to authenticated using (portal_is_internal());
drop policy "briefs admin delete" on portal_briefs;
create policy "briefs admin delete" on portal_briefs
  for delete to authenticated using (portal_is_admin() and portal_is_internal());

-- portal_tam_requests
drop policy "tam readable" on portal_tam_requests;
create policy "tam readable" on portal_tam_requests
  for select to authenticated using (portal_is_internal());
drop policy "tam insert own" on portal_tam_requests;
create policy "tam insert own" on portal_tam_requests
  for insert to authenticated
  with check (requested_by = auth.uid() and portal_is_internal());
drop policy "tam admin decide" on portal_tam_requests;
create policy "tam admin decide" on portal_tam_requests
  for update to authenticated
  using (portal_is_admin() and portal_is_internal())
  with check (portal_is_admin() and portal_is_internal());

-- portal_onboarding_notes
drop policy "notes readable" on portal_onboarding_notes;
create policy "notes readable" on portal_onboarding_notes
  for select to authenticated using (portal_is_internal());
drop policy "notes insert own" on portal_onboarding_notes;
create policy "notes insert own" on portal_onboarding_notes
  for insert to authenticated
  with check (author_id = auth.uid() and portal_is_internal());
drop policy "notes update" on portal_onboarding_notes;
create policy "notes update" on portal_onboarding_notes
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
drop policy "notes delete own or admin" on portal_onboarding_notes;
create policy "notes delete own or admin" on portal_onboarding_notes
  for delete to authenticated
  using ((author_id = auth.uid() or portal_is_admin()) and portal_is_internal());
