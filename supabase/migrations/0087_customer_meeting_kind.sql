-- A customer meeting becomes a journal kind of its own, with two optional
-- fields that describe the meeting: when it happened and who was there.
--
-- Additive only. Existing rows keep their kind, their created_at (the time the
-- record was made, which is not the meeting date) and their text. The exception
-- kinds are unchanged, and nothing that reads them changes: exception handling
-- moves to an explicit set in the app, so a new kind is never an exception by
-- default.
--
-- The check is replaced rather than widened, because Postgres cannot edit the
-- list inside an existing check constraint.

alter table public.journal_entries drop constraint if exists journal_entries_kind_check;
alter table public.journal_entries
  add constraint journal_entries_kind_check
  check (kind in ('note', 'scope', 'customer', 'internal_delivery', 'customer_meeting'));

alter table public.journal_entries
  add column if not exists meeting_date date,
  add column if not exists participants text;
