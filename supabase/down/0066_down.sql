-- Reverses 0066: the creator column and its index.
drop index if exists public.portal_accounts_created_by_idx;
alter table public.portal_accounts drop column if exists created_by;
