-- Reverse of 0044.
--
-- Drops the table and its three triggers. The `account_files` rows that point
-- at completion records are NOT removed: they are listings a person can see in
-- the account's attachments, and silently deleting somebody's visible row on a
-- schema rollback is a surprise. They become links to a token that no longer
-- resolves, which reads as a broken link — recoverable, and obvious.
drop trigger if exists completion_records_frozen on completion_records;
drop trigger if exists completion_records_version_assign on completion_records;
drop trigger if exists completion_records_subject_check on completion_records;
drop function if exists freeze_completion_record();
drop function if exists assign_completion_version();
drop function if exists enforce_completion_subject();
drop table if exists completion_records;
