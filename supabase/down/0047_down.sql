-- Reverse of 0047.
--
-- DATA LOSS, stated plainly: every template card and every deal's intake
-- answers are dropped. The template images stay in the attachments bucket —
-- deleting somebody's library to roll back a schema change would be
-- indefensible, and an orphaned object costs pennies.
alter table portal_accounts drop constraint if exists portal_accounts_intake_is_object;
alter table portal_accounts drop column if exists intake;

drop policy if exists "form_templates internal" on form_templates;
drop table if exists form_templates;
