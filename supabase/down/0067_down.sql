-- Reverses 0067: the customer-facing name column.
alter table public.portal_accounts drop column if exists display_name;
