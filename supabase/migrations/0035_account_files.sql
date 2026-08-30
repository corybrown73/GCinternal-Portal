-- 0035 — one place for the files an account accumulates
--
-- THE PROBLEM. A SOW, a Miro board and a deck all belong to the same account
-- and today they live in three unrelated places: `implementations.sow_document_url`,
-- `implementations.discovery_board_url`, `journal_entries.attachment_url`, and
-- loose rows in `evidence`. Nothing lists them together, so "where is the SOW"
-- is a question you answer by remembering which screen you put it on.
--
-- This table is where new ones go. It does NOT migrate the existing columns —
-- those are read alongside it and presented as one list, because a URL somebody
-- pasted into the SOW field is still the SOW and moving it would break every
-- surface that reads that column.
--
-- FILES AND LINKS ARE THE SAME THING HERE. A Miro board has no file to upload
-- and a signed PowerPoint has no useful URL, but both are "the thing I made for
-- this account". Splitting them into two features would mean two lists, two
-- add buttons, and a person deciding which one their artefact is. One row type,
-- exactly one of the two locations set.

create table account_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  implementation_id uuid not null references implementations (id) on delete cascade,

  -- What kind of artefact, for grouping and for the icon. Free-ish but
  -- constrained: an open text field here becomes "SOW", "sow", "S.O.W." and
  -- then no grouping is possible.
  kind text not null default 'other'
    check (kind in ('sow', 'board', 'deck', 'doc', 'sheet', 'recording', 'other')),

  title text not null check (length(btrim(title)) > 0),
  description text,

  -- A path into the PRIVATE `attachments` bucket (0019). Never a public URL:
  -- the server mints a short-lived signed link per download, so a link that
  -- leaks stops working rather than exposing a customer's SOW forever.
  storage_path text,
  -- ...or a link to something living elsewhere: Miro, Drive, SharePoint.
  external_url text,

  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),

  added_by uuid references portal_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- THE INVARIANT THIS TABLE EXISTS TO HOLD. A row with neither location is a
  -- title pointing at nothing — it looks like an attachment in every list and
  -- fails only when somebody clicks it, which is the worst moment to find out.
  -- A row with both is ambiguous: two sources of truth for one artefact, and
  -- no rule for which one a download should use.
  constraint account_files_one_location check (
    (storage_path is not null and external_url is null)
    or (storage_path is null and external_url is not null)
  )
);

create index account_files_impl_idx on account_files (implementation_id, created_at desc);
create index account_files_kind_idx on account_files (implementation_id, kind);

create trigger account_files_touch before update on account_files
  for each row execute function portal_touch_updated_at();

alter table account_files enable row level security;

-- RLS is defence in depth only — every app read runs as service_role and
-- bypasses it. The app layer is what actually authorises; this stops a future
-- anon-key read path from seeing customer documents by default.
create policy "account_files internal" on account_files
  for all using (portal_is_internal()) with check (portal_is_internal());

comment on table account_files is
  'Every artefact belonging to an account — uploaded files and linked boards '
  'alike. Exactly one of storage_path or external_url is set.';
