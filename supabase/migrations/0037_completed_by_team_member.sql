-- 0037 — one actor table for the delivery side
--
-- THE BUG THIS FIXES. `work_items.completed_by` pointed at `portal_profiles`,
-- while `work_items.owner_id` and `implementation_stage_history.entered_by`
-- both point at `team_members`. The completion path resolves the acting user to
-- their team_member id — correctly, because that is what the neighbouring
-- columns want — and then wrote it into the one column that wanted the other
-- table. Every tick of an exit criterion failed on the foreign key, with the
-- driver's message rendered raw into the page.
--
-- The evidence that it never once worked through the UI: 115 rows carry
-- status='done' and a completed_at, and completed_by is null on all of them.
-- Those were written by migrations and seeds, which never set an actor.
--
-- WHY team_members WINS. Two identity tables exist. `team_members` is the staff
-- directory — 13 rows, everyone who does delivery work, no login required.
-- `portal_profiles` is who can sign in, and it is a child of `auth.users`: a
-- row cannot exist without a GoTrue user behind it, which is why there are only
-- two. Delivery-side columns must name people who may never have logged in — a
-- task can be owned by a TIS who has not been invited yet — so the directory is
-- the only table that can answer them. Pointing this column at the login table
-- made completion impossible for eleven of the thirteen staff by construction.
--
-- The bridge stays: portal_profiles.team_member_id maps a signed-in user to
-- their directory row, and that is what the app resolves before writing here.

-- Any value currently in the column is a portal_profiles id. Map it through the
-- bridge where the profile has one, and null it where it does not — an actor we
-- cannot name is better recorded as unknown than as a wrong person. In this
-- database the column is entirely null, so this converts nothing; it is here so
-- the migration is correct on any environment that does have data.
update work_items w
   set completed_by = p.team_member_id
  from portal_profiles p
 where w.completed_by = p.id
   and p.team_member_id is not null;

update work_items w
   set completed_by = null
 where w.completed_by is not null
   and not exists (select 1 from team_members t where t.id = w.completed_by);

alter table work_items drop constraint if exists work_items_completed_by_fkey;

alter table work_items
  add constraint work_items_completed_by_fkey
  foreign key (completed_by) references team_members (id) on delete set null;

comment on column work_items.completed_by is
  'The team member who completed this, matching owner_id and '
  'implementation_stage_history.entered_by. NOT a portal_profiles id — the '
  'delivery side names people from the staff directory, who may have no login.';
