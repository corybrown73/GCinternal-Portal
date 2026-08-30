-- Down for 0036_account_manager.sql
--
-- Drops the column and its index. The assignments it holds are lost, which is
-- the honest cost: there is nowhere else in the schema that records who manages
-- an account commercially, so there is nothing to fall back to.

drop index if exists customers_account_manager_idx;
alter table customers drop column if exists account_manager_id;
