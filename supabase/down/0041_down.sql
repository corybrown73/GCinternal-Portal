-- Reverse of 0041.
--
-- The column goes, and with it the backfilled links. Those were derived from
-- `portal_accounts.customer_id`, which is untouched, so re-running 0041
-- reproduces them exactly. Nothing a person typed is lost here.
drop index if exists implementations_deal_id_idx;
alter table implementations drop column if exists deal_id;
