-- Down for 0037_completed_by_team_member.sql
--
-- Puts the constraint back on portal_profiles, which is the state in which
-- completing a work item is impossible for anyone whose profile is not also the
-- actor being written. Restoring a broken constraint is what a rollback of this
-- change means; it is recorded here rather than silently improved.
--
-- Values that are team_members ids and have no matching profile are nulled
-- first, because they cannot satisfy the old constraint. That loses the actor
-- on those rows — the honest cost of going back.

update work_items w
   set completed_by = p.id
  from portal_profiles p
 where w.completed_by = p.team_member_id;

update work_items w
   set completed_by = null
 where w.completed_by is not null
   and not exists (select 1 from portal_profiles p where p.id = w.completed_by);

alter table work_items drop constraint if exists work_items_completed_by_fkey;

alter table work_items
  add constraint work_items_completed_by_fkey
  foreign key (completed_by) references portal_profiles (id) on delete set null;
