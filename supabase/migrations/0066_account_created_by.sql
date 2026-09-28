-- 0066: who entered a deal.
--
-- A deal a person had just created was not "theirs": ownership is read from
-- the AM/SE on the account and the owner of the project it becomes, and a
-- freshly entered deal has none of those, so it vanished from its creator's
-- own board. The creator is recorded and counts as the owner until somebody
-- is assigned (lib/ownership.ts). Nullable: integrations and older rows have
-- no creator.
alter table public.portal_accounts
  add column if not exists created_by uuid references public.portal_profiles (id) on delete set null;

create index if not exists portal_accounts_created_by_idx on public.portal_accounts (created_by);

comment on column public.portal_accounts.created_by is
  'The profile that entered the deal in the app; its owner until an implementation owner exists. Null for integrations and rows before 0066.';
