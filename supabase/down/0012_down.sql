-- Down for 0012_sequences_rename.sql
--
-- Drops the compatibility views and renames the tables back. No data moves, so
-- this is lossless — but the app must be rolled back to a build that uses the
-- journey_* names in the same deploy.

drop view if exists journey_enrollments;
drop view if exists journey_steps;
drop view if exists journeys;

alter table sequence_enrollments rename to journey_enrollments;
alter table sequence_steps rename to journey_steps;
alter table sequences rename to journeys;
