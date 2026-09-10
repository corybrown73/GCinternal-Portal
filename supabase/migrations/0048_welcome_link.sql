-- 0048 — the welcome page: the onboarding plan, shared with the customer
--
-- WHAT THIS IS. After a deal closes, the customer gets one link: their
-- onboarding plan as a page — the seven days with dates, who does what,
-- their homework as boxes they can tick, their first form. The same page
-- is what we present on the kickoff call and what prints to the PDF. One
-- source, three outputs, and when a date moves in the portal the customer's
-- page moves with it.
--
-- WHY THIS IS NOT THE EXTERNAL PLAN (0019). That door is for the delivery
-- plan: tasks, comments, a passcode, a session cookie, per-person grants.
-- The welcome page is a brochure with three checkboxes on it, sent to a
-- customer who has known us for a day. A passcode on it would be the first
-- friction of the relationship. So: one token per deal, hashed at rest
-- exactly like every other token in this app, rotatable, revocable by
-- clearing it. No session, no grants.
--
-- WHY THE HOMEWORK IS ITS OWN COLUMN. The customer ticks it from the public
-- page, so the write that path is allowed must be narrow: this column and
-- nothing else on the row. Keeping it out of `intake` means the public path
-- can never touch what the rep typed.

alter table portal_accounts
  add column if not exists welcome_token_hash text,
  add column if not exists welcome_issued_at timestamptz,
  add column if not exists welcome_opened_at timestamptz,
  add column if not exists welcome_homework jsonb not null default '{}'::jsonb;

-- Two deals can never share a link; a hash present without an issue time
-- is a row nobody can reason about.
create unique index if not exists portal_accounts_welcome_token_hash_uq
  on portal_accounts (welcome_token_hash)
  where welcome_token_hash is not null;

alter table portal_accounts add constraint portal_accounts_welcome_issued_with_token
  check (welcome_token_hash is null or welcome_issued_at is not null);

alter table portal_accounts add constraint portal_accounts_welcome_homework_is_object
  check (jsonb_typeof(welcome_homework) = 'object');

comment on column portal_accounts.welcome_token_hash is
  'sha256 of the welcome-page link token. The raw token exists only in the URL '
  'the customer holds. Null means no link has been issued (or it was revoked).';
comment on column portal_accounts.welcome_homework is
  'Homework the customer ticked on their welcome page: item key -> ISO timestamp. '
  'The only column the public page may write.';
