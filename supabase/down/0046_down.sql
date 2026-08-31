-- Reverse of 0046.
--
-- DATA LOSS, stated plainly: the pointer to every uploaded SOW is dropped, on
-- both the deal and the project. The objects themselves stay in the
-- attachments bucket — deleting a countersigned contract to roll back a schema
-- change would be indefensible, and an orphaned object costs pennies.
alter table portal_accounts drop column if exists sow_document_path;
alter table implementations drop column if exists sow_document_path;
