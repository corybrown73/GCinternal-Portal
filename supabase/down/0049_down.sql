-- Reverse of 0049. The hash stays (0048); only the shown link goes.
alter table portal_accounts drop constraint if exists portal_accounts_welcome_url_with_hash;
alter table portal_accounts drop column if exists welcome_share_url;
