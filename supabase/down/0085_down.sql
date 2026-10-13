-- Reverses 0085: the test flags go, and test accounts count again.
alter table public.customers drop column if exists is_test;
alter table public.portal_accounts drop column if exists is_test;
