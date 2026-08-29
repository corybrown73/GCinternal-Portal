-- Down for 0011_portal_implementation_scope.sql
--
-- STOP — this rollback is customer-visible and destructive.
--
-- Implementation-scoped grants cannot exist under the restored account-level
-- unique constraints, so every customer_users / customer_invites row with a
-- non-null implementation_id must be DELETED. Those contacts lose portal
-- access until re-invited. The rollback runbook requires notifying the owning
-- CSM for each affected account.
--
-- Export first:
--   \copy (select * from customer_users   where implementation_id is not null) to 'customer_users_scoped.csv' csv header
--   \copy (select * from customer_invites where implementation_id is not null) to 'customer_invites_scoped.csv' csv header
-- then re-run confirming the export:
--   PGOPTIONS="-c down.scope_export_confirmed=1" psql "$DB_URL" -f 0011_down.sql
--
-- NOTE: the app must be rolled back to a build whose invite write does not
-- depend on scoped columns BEFORE this runs.

do $$
declare
  scoped_count int;
  confirmed text := coalesce(current_setting('down.scope_export_confirmed', true), '');
begin
  select (select count(*) from customer_users where implementation_id is not null)
       + (select count(*) from customer_invites where implementation_id is not null)
    into scoped_count;
  if scoped_count > 0 and confirmed <> '1' then
    raise exception
      'Refusing to delete % implementation-scoped grant/invite row(s): export them first, then set down.scope_export_confirmed=1',
      scoped_count;
  end if;
end $$;

delete from customer_users where implementation_id is not null;
delete from customer_invites where implementation_id is not null;

-- Restore the 0005 RLS policies verbatim.
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
      where t.id = ticket_comments.ticket_id and cu.profile_id = auth.uid()
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
      where t.id = ticket_comments.ticket_id and cu.profile_id = auth.uid()
    )
  );

drop policy "tickets customer insert" on tickets;
create policy "tickets customer insert" on tickets
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from customer_users cu
      where cu.profile_id = auth.uid() and cu.customer_id = tickets.customer_id
    )
  );

drop policy "tickets customer select" on tickets;
create policy "tickets customer select" on tickets
  for select to authenticated
  using (exists (
    select 1 from customer_users cu
    where cu.profile_id = auth.uid() and cu.customer_id = tickets.customer_id
  ));

drop policy "success_criteria customer select" on success_criteria;
create policy "success_criteria customer select" on success_criteria
  for select to authenticated
  using (exists (
    select 1
    from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = success_criteria.implementation_id and cu.profile_id = auth.uid()
  ));

drop policy "commitments customer select" on commitments;
create policy "commitments customer select" on commitments
  for select to authenticated
  using (exists (
    select 1
    from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = commitments.implementation_id and cu.profile_id = auth.uid()
  ));

drop policy "milestones customer select" on milestones;
create policy "milestones customer select" on milestones
  for select to authenticated
  using (exists (
    select 1
    from implementations i
    join customer_users cu on cu.customer_id = i.customer_id
    where i.id = milestones.implementation_id and cu.profile_id = auth.uid()
  ));

drop policy "implementations customer select" on implementations;
create policy "implementations customer select" on implementations
  for select to authenticated
  using (exists (
    select 1 from customer_users cu
    where cu.profile_id = auth.uid() and cu.customer_id = implementations.customer_id
  ));

-- Restore the 0005 signup trigger body verbatim.
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
      insert into customer_users (org_id, profile_id, customer_id, contact_id)
      values (inv.org_id, new.id, inv.customer_id, inv.contact_id)
      on conflict (profile_id, customer_id) do nothing;
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

-- Restore account-level uniqueness and drop the scope columns.
drop index if exists customer_users_implementation_idx;
drop index if exists customer_invites_impl_scope_idx;
drop index if exists customer_invites_account_scope_idx;
drop index if exists customer_users_impl_scope_idx;
drop index if exists customer_users_account_scope_idx;

alter table customer_users
  add constraint customer_users_profile_id_customer_id_key unique (profile_id, customer_id);
alter table customer_invites
  add constraint customer_invites_email_customer_id_key unique (email, customer_id);

alter table customer_users drop column if exists implementation_id;
alter table customer_invites drop column if exists implementation_id;
