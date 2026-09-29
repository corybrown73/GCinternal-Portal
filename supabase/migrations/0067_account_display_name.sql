-- 0067: the customer-facing company name.
--
-- A deal is named the way the opportunity was — "SUNSOURCEHOLDINGS-DR NL" —
-- which is fine on the pipeline and wrong on anything the customer reads.
-- The cleaner (lib/company-name.ts) strips the markers it knows; this column
-- is what a person types when the cleaner is not enough, and every
-- customer-facing surface (welcome page, deck, emails, invites, shared plan,
-- portal) reads it first. Nullable: blank means "use the cleaned deal name".
alter table public.portal_accounts
  add column if not exists display_name text;

comment on column public.portal_accounts.display_name is
  'The company name as the customer says it; used on everything the customer sees. Null = the cleaned deal name.';
