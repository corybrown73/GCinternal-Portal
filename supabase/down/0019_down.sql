-- Down for 0019_external_access.sql
--
-- PRECONDITION, stated honestly: this is lossless only if no link has been
-- opened yet. Once grants exist, external_access_grants is the record of which
-- credential was issued to which named person, and external_plan_events is the
-- append-only evidence of what they did with it. Both are therefore ARCHIVED to
-- v2_archive before anything is dropped, per the ledger's rollback posture.
-- Archives are retained, never dropped by a later re-apply.
--
-- Deliberately KEPT (and why):
--   * implementations.portal_key — dropping it and re-adding it on the next
--     up would mint DIFFERENT keys and break every bookmarked
--     /portal/plan/<key> URL. The column is inert without the rest of this
--     feature. 0019 re-applies over it with `add column if not exists`.
--   * customers.logo_path — a recorded pointer to an uploaded asset.
--   * customer_contacts_email_unique_idx and the merges behind it — the merge
--     already happened and is archived; dropping the index would let the
--     duplicates return, and the next up would merge again, this time on top of
--     data that was written in between.
--   * the 'attachments' storage bucket — production data depends on it and it
--     predates this migration in code (src/lib/hub.server.ts), even though
--     nothing in SQL had provisioned it.
--   * portal_app_config TTL rows — an operator may have tuned them; the up
--     re-seeds with `on conflict do nothing`, so the tuned values survive.

do $$
declare
  n_grants int;
  n_events int;
begin
  select count(*) into n_grants from external_access_grants;
  select count(*) into n_events from external_plan_events;
  if n_grants > 0 or n_events > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.external_access_grants as table external_access_grants';
    execute 'create table if not exists v2_archive.external_plan_events as table external_plan_events';
    raise notice 'archived % grant(s) and % external plan event(s) to v2_archive', n_grants, n_events;
  end if;
end $$;

-- Triggers on tables that survive this rollback have to go explicitly.
drop trigger if exists cc_revoke_grants_trg on customer_contacts;
drop trigger if exists impl_close_revokes_grants_trg on implementations;

drop table if exists external_plan_events;
drop table if exists external_access_grants;

drop function if exists eag_enforce();
drop function if exists revoke_grants_for_contact();
drop function if exists revoke_grants_for_implementation();

-- The buckets are KEPT, and not by preference — Supabase refuses to have it any
-- other way. `storage.protect_delete()` raises on a direct DELETE from
-- storage.buckets ("Use the Storage API instead"), so a migration cannot remove
-- one from SQL at all. This down script used to try, passed against a local
-- stand-in that had no such trigger, and failed on the real stack in CI.
--
-- Keeping them is also the right answer on its own terms: a bucket is an empty
-- container, harmless when unused, and removing one that still holds objects
-- would destroy uploaded files during what is supposed to be a reversible
-- rollback. 'attachments' is doubly untouchable — hub.server.ts has written to
-- it since long before this migration.
--
-- To remove a bucket, use the Storage API or the Supabase dashboard, after
-- confirming it is empty.
do $$
declare
  n_objects int;
begin
  select count(*) into n_objects from storage.objects where bucket_id = 'customer-branding';
  if n_objects > 0 then
    raise notice
      'customer-branding kept with % object(s). Buckets cannot be dropped from SQL; use the Storage API.',
      n_objects;
  else
    raise notice
      'customer-branding kept and empty. Buckets cannot be dropped from SQL; remove it via the Storage API if you want it gone.';
  end if;
end $$;

update portal_app_config
   set value = value - 'external_plan_view_enabled' - 'external_plan_actions_enabled'
 where key = 'v2_flags';

-- Restore the two customer-select policies 0019 dropped, verbatim: the
-- `customers` one from 0005 and the `implementations` one as 0011 last rewrote
-- it (scope-aware). Stated plainly, because a rollback that silently changes
-- the security posture is worse than one that says what it is doing: this
-- RESTORES the full-row read, and with it a customer-auth session's direct
-- PostgREST access to customers.arr/segment and implementations.sow_value,
-- sow_document_url, discovery_board_url/notes, customer_goals and tier.
--
-- It is also load-bearing for the rollback ORDER: 0011_down drops and recreates
-- "implementations customer select" without an `if exists`, and downs run
-- newest-first, so this file must have put the policy back before 0011_down
-- reaches it.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'customers'
       and policyname = 'customers customer select'
  ) then
    execute $p$
      create policy "customers customer select" on customers
        for select to authenticated
        using (exists (
          select 1 from customer_users cu
          where cu.profile_id = auth.uid() and cu.customer_id = customers.id
        ))
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'implementations'
       and policyname = 'implementations customer select'
  ) then
    execute $p$
      create policy "implementations customer select" on implementations
        for select to authenticated
        using (exists (
          select 1 from customer_users cu
          where cu.profile_id = auth.uid()
            and cu.customer_id = implementations.customer_id
            and (cu.implementation_id is null or cu.implementation_id = implementations.id)
        ))
    $p$;
  end if;
end $$;
