-- Reverse of 0048.
--
-- DATA LOSS, stated plainly: every issued welcome link stops working and
-- every homework tick is forgotten. Re-issue from the deal after rolling
-- forward again.
alter table portal_accounts drop constraint if exists portal_accounts_welcome_homework_is_object;
alter table portal_accounts drop constraint if exists portal_accounts_welcome_issued_with_token;
drop index if exists portal_accounts_welcome_token_hash_uq;
alter table portal_accounts
  drop column if exists welcome_homework,
  drop column if exists welcome_opened_at,
  drop column if exists welcome_issued_at,
  drop column if exists welcome_token_hash;
