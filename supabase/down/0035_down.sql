-- Down for 0035_account_files.sql
--
-- DESTRUCTIVE, and says so. Dropping this table discards the record of every
-- file and link somebody attached to an account. The uploaded objects
-- themselves survive in the `attachments` bucket — this removes only the rows
-- that say what they are and which account they belong to, which in practice
-- makes them unfindable.
--
-- 0035 created the table, so down removes it; there is no earlier state to
-- return to. Anyone running this on an environment with real attachments
-- should export the table first.

drop table if exists account_files;
