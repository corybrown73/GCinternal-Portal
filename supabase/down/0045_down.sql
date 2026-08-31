-- Reverse of 0045.
--
-- DATA LOSS, stated plainly: any SOW recorded against a deal, and any customer
-- logo uploaded pre-sale, is dropped with these columns. What was already
-- carried forward into `implementations` and `customers` at handoff survives —
-- that is the point of copying rather than pointing.
--
-- The uploaded logo objects themselves stay in the attachments bucket. Deleting
-- storage from a schema rollback would destroy files this migration never
-- created, and an orphaned object costs pennies where a deleted one costs the
-- customer's logo.
alter table portal_accounts
  drop constraint if exists portal_accounts_sow_signed_not_future,
  drop constraint if exists portal_accounts_sow_value_nonneg;

alter table portal_accounts
  drop column if exists sow_reference,
  drop column if exists sow_signed_date,
  drop column if exists sow_value,
  drop column if exists sow_document_url,
  drop column if exists sow_document_name,
  drop column if exists logo_path;
