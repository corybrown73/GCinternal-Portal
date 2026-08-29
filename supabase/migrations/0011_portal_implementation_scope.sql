-- 0011 — Implementation-scoped portal grants.
--
-- customer_users / customer_invites gain an optional implementation_id:
--   NULL      = account-wide grant (every existing row — today's behavior)
--   non-NULL  = the login sees exactly that one implementation
--
-- REQUIRES: the select-then-insert-or-update invite write (commit 852ccb6) to
-- already be live. This migration drops the unique constraints the previous
-- PostgREST upsert used as its ON CONFLICT arbiter; a column-list ON CONFLICT
-- cannot target a partial unique index, so the old code breaks the moment this
-- runs.
--
-- Enforcement note: every portal read/write runs on the service-role client,
-- so these RLS policies are defense-in-depth. The load-bearing gate is the
-- app-layer grant check; it is NOT feature-flagged, because honoring a scope
-- that has been issued is a security invariant rather than a feature.
--
-- Rollback: supabase/down/0011_down.sql (destructive for scoped rows — read it).

-- ---------------------------------------------------------------------------
-- A. Scoped grant columns + partial uniqueness
-- ---------------------------------------------------------------------------
alter table customer_users
  add column implementation_id uuid references implementations (id) on delete cascade;
alter table customer_invites
  add column implementation_id uuid references implementations (id) on delete cascade;

-- Constraint names verified against production before shipping.
alter table customer_users drop constraint customer_users_profile_id_customer_id_key;
create unique index customer_users_account_scope_idx
  on customer_users (profile_id, customer_id)
  where implementation_id is null;
create unique index customer_users_impl_scope_idx
  on customer_users (profile_id, customer_id, implementation_id)
  where implementation_id is not null;

alter table customer_invites drop constraint customer_invites_email_customer_id_key;
create unique index customer_invites_account_scope_idx
  on customer_invites (email, customer_id)
  where implementation_id is null;
create unique index customer_invites_impl_scope_idx
  on customer_invites (email, customer_id, implementation_id)
  where implementation_id is not null;

create index customer_users_implementation_idx
  on customer_users (implementation_id)
  where implementation_id is not null;

-- ---------------------------------------------------------------------------
-- B. Signup trigger carries the invite's scope onto the grant
-- ---------------------------------------------------------------------------
-- Verbatim 0005 body except: the customer_users insert carries
-- implementation_id, and the ON CONFLICT names no arbiter (a column list
-- cannot target the partial indexes above).
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

revoke execute on function portal_handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- C. RLS: customer policies honour the grant's scope (defense-in-depth)
-- ---------------------------------------------------------------------------
-- A NULL implementation_id keeps exactly today's behavior, so these rewrites
-- are behaviourally invisible until a scoped grant is issued.
-- `customers` and `customer_contacts` stay account-level and are unchanged.

drop policy "implementations customer select" on implementations;
create policy "implementations customer select" on implementations
  for select to authenticated
  using (exists (
    select 1 from customer_users cu
    where cu.profile_id = auth.uid()
      and cu.customer_id = implementations.customer_id
      and (cu.implementation_id is null or cu.implementation_id = implementations.id)
  ));

drop policy "milestones customer select" on milestones;
create policy "milestones customer select" on milestones
  for select to authenticated
  using (exists (
    select 1
    from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = milestones.implementation_id
      and cu.profile_id = auth.uid()
      and (cu.implementation_id is null or cu.implementation_id = i.id)
  ));

drop policy "commitments customer select" on commitments;
create policy "commitments customer select" on commitments
  for select to authenticated
  using (exists (
    select 1
    from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = commitments.implementation_id
      and cu.profile_id = auth.uid()
      and (cu.implementation_id is null or cu.implementation_id = i.id)
  ));

drop policy "success_criteria customer select" on success_criteria;
create policy "success_criteria customer select" on success_criteria
  for select to authenticated
  using (exists (
    select 1
    from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = success_criteria.implementation_id
      and cu.profile_id = auth.uid()
      and (cu.implementation_id is null or cu.implementation_id = i.id)
  ));

-- Tickets may be account-level (implementation_id null); a scoped user still
-- sees and files those, matching the app-layer rule.
drop policy "tickets customer select" on tickets;
create policy "tickets customer select" on tickets
  for select to authenticated
  using (exists (
    select 1 from customer_users cu
    where cu.profile_id = auth.uid()
      and cu.customer_id = tickets.customer_id
      and (
        cu.implementation_id is null
        or tickets.implementation_id is null
        or tickets.implementation_id = cu.implementation_id
      )
  ));

drop policy "tickets customer insert" on tickets;
create policy "tickets customer insert" on tickets
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from customer_users cu
      where cu.profile_id = auth.uid()
        and cu.customer_id = tickets.customer_id
        and (
          cu.implementation_id is null
          or tickets.implementation_id is null
          or tickets.implementation_id = cu.implementation_id
        )
    )
  );

drop policy "ticket_comments customer select" on ticket_comments;
create policy "ticket_comments customer select" on ticket_comments
  for select to authenticated
  using (
    internal = false
    and exists (
      select 1
      from tickets t
      join customer_users cu on cu.customer_id = t.customer_id
      where t.id = ticket_comments.ticket_id
        and cu.profile_id = auth.uid()
        and (
          cu.implementation_id is null
          or t.implementation_id is null
          or t.implementation_id = cu.implementation_id
        )
    )
  );

drop policy "ticket_comments customer insert" on ticket_comments;
create policy "ticket_comments customer insert" on ticket_comments
  for insert to authenticated
  with check (
    internal = false
    and author_id = auth.uid()
    and exists (
      select 1
      from tickets t
      join customer_users cu on cu.customer_id = t.customer_id
      where t.id = ticket_comments.ticket_id
        and cu.profile_id = auth.uid()
        and (
          cu.implementation_id is null
          or t.implementation_id is null
          or t.implementation_id = cu.implementation_id
        )
    )
  );
