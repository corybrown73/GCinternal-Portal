-- 0036 — the commercial contact on an account
--
-- Post-sale, an account has two owners and they are different people doing
-- different jobs:
--
--   * the TIS (`implementations.owner_id`) owns the DELIVERY — the project, the
--     plan, whether it lands. One per project, so a customer running a new-logo
--     rollout and an integration has two.
--   * the account manager owns the COMMERCIAL relationship — the renewal, the
--     expansion, the pricing conversation. One per customer, across every
--     project they have.
--
-- That difference in cardinality is why this column is on `customers` and the
-- TIS is on `implementations`. Putting the AM on the project would mean
-- recording the same person twice for one customer and letting the two copies
-- disagree.
--
-- `csm_owner_id` (0010) already exists and is NOT this. A CSM is a post-launch
-- success owner; an AM is the commercial contact from the start. Some
-- organisations merge them and some do not, and collapsing them here would make
-- that an unchangeable decision.
alter table customers
  add column if not exists account_manager_id uuid references team_members (id) on delete set null;

comment on column customers.account_manager_id is
  'The commercial contact for this account — renewals, expansion, pricing. One '
  'per customer, distinct from the per-project TIS and from csm_owner_id.';

create index if not exists customers_account_manager_idx
  on customers (account_manager_id) where account_manager_id is not null;
