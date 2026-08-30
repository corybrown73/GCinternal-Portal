-- Down for 0030_user_invites.sql
--
-- Restores portal_handle_new_user to its 0011 form (customer invite, then the
-- domain allowlist) and drops the invite table.
--
-- The function is restored FIRST. Dropping the table while the trigger still
-- referenced it would leave every signup failing on a missing relation in the
-- window between the two statements.
--
-- Accepted invites are lost, and that is acceptable: the profiles they created
-- are unaffected, and an accepted invite is a record of how somebody arrived,
-- not of what they can do. Pending invites are lost too — anyone mid-signup
-- falls back to the domain allowlist, which is exactly the pre-0030 behaviour.

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
end $$;

drop table if exists portal_user_invites;
