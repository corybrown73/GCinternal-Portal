-- 0042 — the fields a handoff actually has to carry.
--
-- Item 2 asks for four things to cross from the deal into the project. Only
-- one of them could: `portal_accounts.summary` exists and is populated on
-- every deal. The other three were asking for columns that are not there.
--
--   * NAMED DEAL CONTACT — there is no contact on a deal. Not on
--     portal_accounts, not on the brief, not on the Gong report, not on the
--     onboarding note. The champion a salesperson spent three months talking
--     to has nowhere to be written down, which is the whole reason
--     "Confirm the champion and the decision maker" can be ticked against zero
--     contacts. The source is added here so the carry has something to carry.
--
--   * AM/SE OWNER — `am_owner_id` and `se_owner_id` exist and are null on all
--     four deals, and they reference `portal_profiles`: LOGINS, of which this
--     org has two. `implementations.sales_owner` is free text. See below for
--     why both stay.
--
--   * DOMAIN — `portal_accounts.domain` is populated on every deal and
--     `customers` has nowhere to put it.

-- ---------------------------------------------------------------------------
-- The customer's domain
-- ---------------------------------------------------------------------------
-- Not decorative: it is how a person confirms the account in front of them is
-- the one the deal was about, and it is the obvious key for matching an
-- inbound email or a Salesforce account later.
alter table customers add column if not exists domain text;
comment on column customers.domain is
  'Primary web domain, carried from the deal at handoff. Not unique: subsidiaries and rebrands share one.';

-- ---------------------------------------------------------------------------
-- The named contact on a deal
-- ---------------------------------------------------------------------------
-- Deliberately three plain columns rather than a deal_contacts table. A deal
-- has ONE champion worth carrying at handoff; the many-contacts model already
-- exists on the delivery side as `customer_contacts`, and this is the door
-- between them. A second contacts table would need its own UI, its own
-- de-duplication against the first, and would answer a question nobody asked.
alter table portal_accounts add column if not exists primary_contact_name text;
alter table portal_accounts add column if not exists primary_contact_email text;
alter table portal_accounts add column if not exists primary_contact_role text;

comment on column portal_accounts.primary_contact_name is
  'The champion on this deal. Carried into customer_contacts at handoff — the point at which one contact becomes many.';

-- ---------------------------------------------------------------------------
-- Who sold it, as a reference
-- ---------------------------------------------------------------------------
-- `sales_owner` (text) STAYS, and this sits beside it rather than replacing
-- it. The existing column carries a comment defending free text: the person
-- who closed the deal may have left, and the record should still say who it
-- was. That reasoning is correct and a foreign key alone would lose it —
-- ON DELETE SET NULL empties the reference and takes the name with it.
--
-- So: the id is the live link (their current accounts, their queue, notifying
-- them when a handoff is returned), and the text is the durable record of who
-- it was. When both are present they agree; when only the text survives, the
-- record still answers the question.
--
-- team_members, not portal_profiles. A sales owner needs to be NAMEABLE, not
-- to hold a login — the same distinction 0037 settled for completed_by. All
-- thirteen staff are in team_members; two of them have logins.
alter table implementations
  add column if not exists sales_owner_id uuid references team_members (id) on delete set null;

comment on column implementations.sales_owner_id is
  'Who sold this, as a reference. Sits beside sales_owner (text), which remains the durable record for people who have since left.';

create index if not exists implementations_sales_owner_id_idx
  on implementations (sales_owner_id)
  where sales_owner_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill the reference from the name already recorded
-- ---------------------------------------------------------------------------
-- An exact, unambiguous name match against the active directory. Not fuzzy,
-- not first-name-only: a wrong link here silently attributes somebody else's
-- deal, and "no link" is a state the app already renders honestly.
do $$
declare n int;
begin
  update implementations i
     set sales_owner_id = tm.id
    from team_members tm
   where i.sales_owner_id is null
     and i.sales_owner is not null
     and tm.active
     and lower(btrim(tm.name)) = lower(btrim(i.sales_owner))
     and (select count(*) from team_members t2
           where t2.active and lower(btrim(t2.name)) = lower(btrim(i.sales_owner))) = 1;
  get diagnostics n = row_count;
  raise notice '0042: resolved % sales owner name(s) to a directory record', n;
end $$;
