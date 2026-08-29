-- 0012 — Rename the email-drip feature to "Sequences".
--
-- Why this comes first: the v2 lifecycle work needs the `journey_` prefix for
-- journey templates (implementations.journey_template_id, journey_type — the
-- vocabulary the brief and the UI use for the delivery lifecycle). Today those
-- names are taken by the email drip. Renaming the drip BEFORE any journey_*
-- table exists means the prefix is unambiguous at every point in history.
--
-- Indexes, constraints, FKs and RLS policies all ride along with a table
-- rename; only policy *names* keep the old wording, which is cosmetic.
-- `engagement_events` and `content_items` are not renamed — no collision.
--
-- Rollback: supabase/down/0012_down.sql

alter table journeys rename to sequences;
alter table journey_steps rename to sequence_steps;
alter table journey_enrollments rename to sequence_enrollments;

-- Compatibility views for the deploy window: the currently-running build still
-- reads and writes the old names. Single-table views are auto-updatable, so
-- inserts/updates/deletes (including insert-returning and the 23505 conflict
-- fallback) keep working until the code cutover ships. security_invoker means
-- they enforce the underlying table's RLS as the caller, not as the view owner.
-- Dropped by 0017, one release after the cutover is verified.
create view journeys with (security_invoker = true) as select * from sequences;
create view journey_steps with (security_invoker = true) as select * from sequence_steps;
create view journey_enrollments with (security_invoker = true) as
  select * from sequence_enrollments;

grant select, insert, update, delete on journeys to authenticated, service_role;
grant select, insert, update, delete on journey_steps to authenticated, service_role;
grant select, insert, update, delete on journey_enrollments to authenticated, service_role;
