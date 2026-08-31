-- 0044 — the completion record: what was actually done, frozen at the moment
--        it was finished
--
-- THE PROBLEM. When a project graduates to CS, or an engineer marks a solution
-- validated, everything that was done is still scattered across a dozen tables
-- and stays live. Ask six months later "what did we build for them?" and the
-- honest answer is "look at the current state of nine screens" — which is not
-- what was done, it is what is true now. Requirements get reworded. Risks get
-- closed. Owners leave. The record of the work erodes into the record of the
-- present.
--
-- So a completion record is a FROZEN DOCUMENT, the same discipline
-- `plan_snapshots` (0022) already uses for the weekly customer update: the
-- content is projected once, at completion, and stored whole. Nothing renders
-- it by re-querying. A PDF of a completion record shows what the work looked
-- like when it finished, permanently, and cannot drift.
--
-- WHY A NEW TABLE AND NOT `account_files`. An account file is a thing a person
-- put somewhere — a SOW, a Miro board. This is generated, versioned, and tied
-- to a specific subject that completed. It also carries the two things the
-- Salesforce side needs and a file row has nowhere to put: the note body, and
-- the Salesforce ids it belongs against. An `account_files` row IS created
-- alongside, pointing at this one, so the document appears in the account's
-- attachment list where people look for it.
--
-- WHAT LEAVES THIS SYSTEM. Nothing, here. The row is emitted onto the existing
-- event outbox (0023) as `completion.recorded`; a consumer is what writes the
-- note and the attachment into Salesforce. That boundary is deliberate: this
-- app has never held Salesforce credentials and does not start now.

create table completion_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),

  -- Always set, even for a solution, so an account's records are one query.
  implementation_id uuid not null references implementations (id) on delete cascade,

  -- Two things can complete. An implementation graduating to CS, and one
  -- solution being validated. Both produce the same shape of document.
  subject_type text not null check (subject_type in ('implementation', 'solution')),
  subject_id uuid not null,

  -- Work finishes more than once. A project can graduate, be reopened for a
  -- phase two, and graduate again; a solution can be validated, changed, and
  -- re-validated. Each is its own document — nothing is overwritten, so an
  -- earlier record stays exactly as it was issued.
  version integer not null check (version >= 1),

  title text not null check (length(btrim(title)) > 0),

  -- The frozen document. Rendered to PDF by one serializer and never
  -- re-queried. Shape lives in src/lib/completion-record.ts.
  content jsonb not null,

  -- The same document as plain prose, for the body of a Salesforce note. Kept
  -- beside the JSON rather than derived at send time so that what was filed
  -- and what was shown can never disagree.
  summary_text text not null check (length(btrim(summary_text)) > 0),

  -- The document is reachable at /api/completion-record/{token} without a
  -- login, the way a plan snapshot is: a webhook consumer fetching it days
  -- later must still be able to. Only the hash is stored — a leaked database
  -- dump does not hand out the documents.
  share_token_hash text not null,

  -- Copied at generation, not joined at read. Where the note is destined to
  -- land is part of what was recorded; if the opportunity is re-linked later,
  -- this record still says where it went.
  salesforce_account_id text,
  salesforce_opportunity_id text,

  -- The attachment-list row that points back here. SET NULL: deleting the
  -- listing entry must never take the record of the work with it.
  account_file_id uuid references account_files (id) on delete set null,

  generated_by uuid references portal_profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint completion_records_version_unique
    unique (org_id, subject_type, subject_id, version)
);

create unique index completion_records_token_idx
  on completion_records (share_token_hash);
create index completion_records_impl_idx
  on completion_records (implementation_id, created_at desc);
create index completion_records_subject_idx
  on completion_records (subject_type, subject_id, version desc);

-- ---------------------------------------------------------------------------
-- The subject must belong to the implementation it is filed under
-- ---------------------------------------------------------------------------
-- `subject_id` is a uuid with no foreign key — it points at two different
-- tables depending on `subject_type`, so no single FK can hold it. Without
-- this, a solution from account A can be filed as account B's completion
-- record, and the account's list of what was delivered quietly includes work
-- done for somebody else. A trigger rather than a CHECK because it has to read
-- another table.
create or replace function enforce_completion_subject()
returns trigger language plpgsql as $$
declare
  v_impl uuid;
begin
  if new.subject_type = 'implementation' then
    if new.subject_id <> new.implementation_id then
      raise exception
        'completion subject mismatch: an implementation record must be its own subject (% <> %)',
        new.subject_id, new.implementation_id;
    end if;
    return new;
  end if;

  select implementation_id into v_impl
    from technical_solutions where id = new.subject_id;
  if v_impl is null then
    raise exception 'completion subject mismatch: no solution % exists', new.subject_id;
  end if;
  if v_impl <> new.implementation_id then
    raise exception
      'completion subject mismatch: solution % belongs to implementation %, not %',
      new.subject_id, v_impl, new.implementation_id;
  end if;
  return new;
end $$;

create trigger completion_records_subject_check
  before insert or update on completion_records
  for each row execute function enforce_completion_subject();

-- ---------------------------------------------------------------------------
-- Versions are assigned by the database, not by the caller
-- ---------------------------------------------------------------------------
-- Two people finishing the same thing at once both read "the latest is 2" and
-- both write 3. The unique constraint above catches the collision, but only if
-- the number comes from a single place; a caller that computes its own version
-- and passes it can also pass 1 over an existing 1. The passed value is
-- ignored entirely.
create or replace function assign_completion_version()
returns trigger language plpgsql as $$
begin
  select coalesce(max(version), 0) + 1 into new.version
    from completion_records
   where org_id = new.org_id
     and subject_type = new.subject_type
     and subject_id = new.subject_id;
  return new;
end $$;

create trigger completion_records_version_assign
  before insert on completion_records
  for each row execute function assign_completion_version();

-- A record is issued, not edited. Nothing in the app updates one, and the
-- frozen-document promise is worth an actual refusal rather than a convention.
create or replace function freeze_completion_record()
returns trigger language plpgsql as $$
begin
  if new.content is distinct from old.content
     or new.summary_text is distinct from old.summary_text
     or new.subject_id is distinct from old.subject_id
     or new.subject_type is distinct from old.subject_type
     or new.version is distinct from old.version then
    raise exception 'completion record % is frozen: reissue a new version instead of editing', old.id;
  end if;
  return new;
end $$;

create trigger completion_records_frozen
  before update on completion_records
  for each row execute function freeze_completion_record();

alter table completion_records enable row level security;

-- Defence in depth only: every app read runs as service_role and bypasses this.
-- The app layer authorises. This stops a future anon-key path from reading a
-- customer's completion history by default.
create policy "completion_records internal" on completion_records
  for all using (portal_is_internal()) with check (portal_is_internal());

comment on table completion_records is
  'A frozen record of work that finished — an implementation graduating to CS '
  'or a solution reaching validated. Issued, never edited; reissued as a new '
  'version. Rendered to PDF from `content` alone.';
