-- Reverse of 0050. The ledger of who got what is dropped; owners already
-- written on implementations stay, since they are facts about the project.
drop policy if exists "assignments internal" on portal_assignments;
drop policy if exists "assignment_pool internal" on portal_assignment_pool;
drop table if exists portal_assignments;
drop table if exists portal_assignment_pool;
