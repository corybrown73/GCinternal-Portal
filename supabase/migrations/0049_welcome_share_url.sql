-- 0049 — keep the welcome link itself, not only its hash
--
-- 0048 stored the sha256 of the customer's link, on the pattern every other
-- token in this app follows: the raw value exists in the URL the customer
-- holds and nowhere else. That pattern has a cost here it does not have
-- elsewhere: the welcome page needs to SHOW the link — as a QR code on the
-- cover in present mode, as "copy the link again" on the toolbar — and a
-- hash cannot be shown. So the link is also kept as given.
--
-- WHY THAT IS ACCEPTABLE FOR THIS TOKEN AND NOT THE OTHERS. A welcome link
-- opens a brochure with three checkboxes on it: the plan's dates, the
-- homework, the first form's name. No tasks, no comments, no files, no
-- account data beyond what a customer already knows about themselves. The
-- external plan door (0019) guards a great deal more, and keeps hashing.
-- Revoking clears both columns; rotating replaces both.

alter table portal_accounts add column if not exists welcome_share_url text;

alter table portal_accounts add constraint portal_accounts_welcome_url_with_hash
  check (welcome_share_url is null or welcome_token_hash is not null);

comment on column portal_accounts.welcome_share_url is
  'The customer''s welcome link as issued, kept so the page can show it as a QR '
  'and copy it again. Cleared on revoke, replaced on rotate. A brochure link.';
