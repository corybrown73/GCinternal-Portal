-- 0021 — Work items learn who outside the company touched them.
--
-- Design: docs/design/portal-access.md §2.4, renumbered 0013 -> 0021 per the
-- ledger in docs/PLAN.md. Depends on 0014 (work_items).
--
-- THE RULE THIS SCHEMA ENCODES. The append-only external_plan_events (0019) and
-- portal_audit_log (0020) rows are the completion evidence of record. The three
-- columns added to work_items are a denormalized "latest state" pointer, never
-- the evidence itself. Reopening a task records a task_reopened event and flips
-- status; it does NOT clear completed_by_contact_id / completed_at. A later
-- completion appends a new event and moves the pointer. Nothing recorded is
-- ever erased or overwritten.
--
-- NAMING-COLLISION CHECK: work_item_comments and work_item_files checked
-- against the full 28-table prototype list in the 0003 header plus every
-- hub/portal table — no collision. (The prototype's nearest names are
-- submission_fields and reports; neither is close enough to confuse.)
--
-- COLUMN AUDIT for the customer-readable policies below — every column a
-- customer-auth browser session can read directly must be customer-safe:
--   work_item_comments: id, org_id, work_item_id, author_profile_id,
--     author_contact_id, internal, body, created_at. `internal = true` comments
--     are excluded by the policy itself (the ticket_comments precedent, 0006);
--     the remaining columns are the customer's own thread. author_profile_id is
--     a uuid, not content — and no uuid ever reaches the token door, which
--     renders exclusively through buildSharedPlanDTO.
--   work_item_files: id, org_id, work_item_id, implementation_id,
--     storage_path, file_name, mime_type, size_bytes, uploaded_by_*,
--     created_at. storage_path is a path into a PRIVATE bucket; holding it
--     grants nothing without a signed URL.
--
-- Rollback: supabase/down/0021_down.sql.

-- ---------------------------------------------------------------------------
-- A. External columns on work_items
-- ---------------------------------------------------------------------------
-- All nullable: no table rewrite, no behavior change to instantiation,
-- dependency evaluation or date recalculation.
--
-- `if not exists` is load-bearing: 0021_down KEEPS these columns (dropping
-- completed_by_contact_id while status stays 'done' erases who completed a
-- customer's task), so a re-apply after a rollback finds them present.
alter table work_items
  add column if not exists assigned_contact_id uuid
    references customer_contacts (id) on delete set null,
  add column if not exists completed_by_contact_id uuid
    references customer_contacts (id) on delete set null,
  add column if not exists completed_via text;

do $$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.work_items'::regclass
     and contype = 'c'
     and conname = 'work_items_completed_via_check';
  if cname is not null then
    execute format('alter table work_items drop constraint %I', cname);
  end if;
end $$;

alter table work_items
  add constraint work_items_completed_via_check
  check (completed_via is null or completed_via in ('internal', 'external_link', 'external_auth'));

create index if not exists work_items_assigned_contact_idx
  on work_items (assigned_contact_id)
  where assigned_contact_id is not null;

-- ---------------------------------------------------------------------------
-- B. work_item_comments
-- ---------------------------------------------------------------------------
create table work_item_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  work_item_id uuid not null references work_items (id) on delete cascade,
  -- Exactly one of these is set; the check below refuses a comment with no
  -- author at all, which is how attribution quietly disappears.
  author_profile_id uuid references portal_profiles (id) on delete set null,
  author_contact_id uuid references customer_contacts (id) on delete set null,
  -- Same rule as ticket_comments.internal: an internal note is never rendered
  -- to a customer, through either door. Forced false server-side on every
  -- external write.
  internal boolean not null default false,
  body text not null,
  created_at timestamptz not null default now(),
  constraint work_item_comments_author_check
    check (author_profile_id is not null or author_contact_id is not null)
);

create index work_item_comments_item_idx on work_item_comments (work_item_id, created_at);

-- ---------------------------------------------------------------------------
-- C. work_item_files
-- ---------------------------------------------------------------------------
create table work_item_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  work_item_id uuid not null references work_items (id) on delete cascade,
  -- Denormalized so a file can be scoped without a join through work_items,
  -- and so an upload can never be written under another implementation's
  -- storage prefix without the mismatch being visible in one row.
  implementation_id uuid not null references implementations (id) on delete cascade,
  -- implementations/<impl_id>/external/<grant_id>/<uuid>_<name> in the private
  -- 'attachments' bucket (provisioned by 0019).
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by_contact_id uuid references customer_contacts (id) on delete set null,
  uploaded_by_profile_id uuid references portal_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index work_item_files_item_idx on work_item_files (work_item_id, created_at);
create index work_item_files_impl_idx on work_item_files (implementation_id);

-- ---------------------------------------------------------------------------
-- D. RLS (defense-in-depth; the server functions are the real boundary)
-- ---------------------------------------------------------------------------
-- The token door is service-role only and appears nowhere in these policies:
-- a link bearer has no auth.uid(), so RLS can only ever answer "no rows" for
-- them, which is exactly what it should answer.
alter table work_item_comments enable row level security;
alter table work_item_files enable row level security;

create policy "work_item_comments internal" on work_item_comments
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());

-- Customer-auth read, honouring the implementation scope from 0011, and never
-- an internal note.
create policy "work_item_comments customer select" on work_item_comments
  for select to authenticated
  using (
    internal = false
    and exists (
      select 1
        from work_items w
        join implementations i on i.id = w.implementation_id
        join customer_users cu on cu.customer_id = i.customer_id
       where w.id = work_item_comments.work_item_id
         and cu.profile_id = auth.uid()
         and (cu.implementation_id is null or cu.implementation_id = i.id)
    )
  );

create policy "work_item_files internal" on work_item_files
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());

create policy "work_item_files customer select" on work_item_files
  for select to authenticated
  using (
    exists (
      select 1
        from implementations i
        join customer_users cu on cu.customer_id = i.customer_id
       where i.id = work_item_files.implementation_id
         and cu.profile_id = auth.uid()
         and (cu.implementation_id is null or cu.implementation_id = i.id)
    )
  );
