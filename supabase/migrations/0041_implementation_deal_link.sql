-- 0041 — which deal produced this project.
--
-- WHAT WAS ACTUALLY MISSING. A link between the pre-sales record and the
-- delivery record does exist: `portal_accounts.customer_id`, written when
-- somebody clicks Start onboarding on a deal. It points at a CUSTOMER.
--
-- But this app is explicit that one customer profile carries N projects — a
-- new logo signed in June and the integration added in August are two
-- implementations on one customer. So "which deal produced THIS project" has
-- no answer today, and from an implementation there is no way back to the deal
-- at all. The context the deal holds (its goal, its contact, who sold it) is
-- one join away and unreachable.
--
-- ON DELETE SET NULL, not CASCADE. Deleting a deal record must never delete
-- delivery work; losing the provenance is bad, losing the project is
-- unthinkable.
alter table implementations
  add column if not exists deal_id uuid references portal_accounts (id) on delete set null;

comment on column implementations.deal_id is
  'The pre-sales deal (portal_accounts) this project came from. Nullable: projects predate the link, and some are created without a deal at all.';

-- Answering "what did this deal become" without a sequential scan.
create index if not exists implementations_deal_id_idx
  on implementations (deal_id)
  where deal_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill, only where it is a fact rather than a guess
-- ---------------------------------------------------------------------------
-- A person recorded `portal_accounts.customer_id` by starting onboarding from
-- that deal. Where exactly ONE deal points at a customer AND that customer has
-- exactly ONE project, the pairing is not inferred — there is only one thing it
-- can mean, and reading it back is faithful to what they did.
--
-- Everything else is left null on purpose. A customer with two deals or two
-- projects needs a person to say which goes with which, and a plausible guess
-- written into a provenance column is worse than an empty one: the empty column
-- asks the question, the guess answers it wrongly and silently.
do $$
declare n int;
begin
  with unambiguous as (
    select pa.id as deal_id, i.id as impl_id
      from portal_accounts pa
      join customers c on c.id = pa.customer_id
      join implementations i on i.customer_id = c.id
     where pa.customer_id is not null
     group by pa.id, i.id, c.id
    having (select count(*) from portal_accounts x where x.customer_id = c.id) = 1
       and (select count(*) from implementations y where y.customer_id = c.id) = 1
  )
  update implementations i
     set deal_id = u.deal_id
    from unambiguous u
   where i.id = u.impl_id
     and i.deal_id is null;
  get diagnostics n = row_count;
  raise notice '0041: linked % implementation(s) to their deal; the rest need a person to say', n;
end $$;
