-- 0085: a test account is marked, so the book's numbers leave it out.
--
-- QA rehearsals, Field Fusion dry runs and probes live in production next
-- to real customers, and every count (Home, Reports, the Customers list,
-- the Pipeline subtitle, nudges, stall alerts, the digest and the daily
-- report) counted them. The flag sits on the deal AND the customer: a deal
-- can exist with no customer yet (an MCP or API deal before onboarding),
-- and a customer page can carry several deals. The app treats either one
-- being set as "test" (src/lib/test-accounts.ts).
--
-- Nothing is flagged here. The test rows are reviewed and flagged by hand.
alter table public.portal_accounts
  add column if not exists is_test boolean not null default false;

alter table public.customers
  add column if not exists is_test boolean not null default false;

comment on column public.portal_accounts.is_test is
  'A test deal: left out of Home, Reports, nudges and alerts unless asked for (0085).';
comment on column public.customers.is_test is
  'A test customer: left out of Home, Reports, nudges and alerts unless asked for (0085).';
