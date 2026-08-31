-- 0045 — the two things a kickoff deck needs and a deal could not hold
--
-- THE PROBLEM. The kickoff and handoff deck is generated on the PRE-SALE side,
-- from `portal_accounts`. It is supposed to carry the SOW and to be co-branded
-- with the customer's logo. A deal could record neither.
--
--  - The SOW columns exist, but on `implementations` — which does not exist
--    yet when the deck is built. (In production today: 0 of 9 implementations
--    have one recorded, because the only place to put it is a screen nobody
--    reaches until after handoff.)
--  - The logo exists, but on `customers` — likewise created at handoff by
--    startOnboarding.
--
-- So both move UPSTREAM to where the information actually arrives: the SOW is
-- signed before close, and an AE has the customer's logo from the first deck
-- they built.
--
-- CARRIED, NOT DUPLICATED. 0042 established the pattern — a deal records a
-- fact, handoff carries it into delivery, and both sides keep their own column
-- so the deal's record of what was sold does not change when delivery edits
-- its copy. The same five SOW columns and the same storage path, named
-- identically on both tables so the carry is a copy and not a translation.
--
-- NO BACKFILL. There is nothing to backfill in either direction: no
-- implementation has a SOW, and no customer has a logo. A backfill here would
-- be zero rows and a paragraph pretending otherwise.

alter table portal_accounts
  -- Mirrors implementations.sow_* exactly. See src/lib/deal-carryover.ts.
  add column if not exists sow_reference text,
  add column if not exists sow_signed_date date,
  add column if not exists sow_value numeric,
  add column if not exists sow_document_url text,
  add column if not exists sow_document_name text,
  -- A path into the private `attachments` bucket, never a public URL — the
  -- same rule customers.logo_path follows. The server mints a short-lived
  -- signed link per read.
  add column if not exists logo_path text;

-- A signed date in the future is a typo, and it reaches a customer-facing deck.
-- Cheap to refuse, expensive to find later.
alter table portal_accounts
  drop constraint if exists portal_accounts_sow_signed_not_future;
alter table portal_accounts
  add constraint portal_accounts_sow_signed_not_future
  check (sow_signed_date is null or sow_signed_date <= (current_date + 1));

-- A negative contract value is never a real value.
alter table portal_accounts
  drop constraint if exists portal_accounts_sow_value_nonneg;
alter table portal_accounts
  add constraint portal_accounts_sow_value_nonneg
  check (sow_value is null or sow_value >= 0);

comment on column portal_accounts.sow_reference is
  'The SOW as recorded on the deal. Carried into implementations.sow_reference '
  'at handoff; both sides keep their own copy.';
comment on column portal_accounts.logo_path is
  'The customer''s logo, uploaded pre-sale. Carried into customers.logo_path at '
  'handoff. A path into the private attachments bucket, never a public URL.';
