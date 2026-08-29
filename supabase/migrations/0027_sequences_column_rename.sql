-- 0027 — Finish the rename 0012 started.
--
-- BUG-06, found by black-box QA: /sequences renders blank. The app queries
-- `sequence_steps.sequence_id` and `sequence_enrollments.sequence_id` and gets
-- a 400 from PostgREST, because the column is still called `journey_id`.
--
-- 0012 renamed the TABLES (journeys -> sequences, journey_steps ->
-- sequence_steps, journey_enrollments -> sequence_enrollments) and left the
-- foreign-key COLUMNS named journey_id. The app-side rename went all the way;
-- the schema went half way. So a table called `sequence_steps` has a column
-- called `journey_id` pointing at `sequences` — which is precisely the "journey
-- means two different things" confusion 0012 existed to remove, preserved in
-- the one place it is hardest to see.
--
-- Two vocabularies collided here and it is worth being explicit about which one
-- won. `journey` in the LIFECYCLE sense (journey_templates, the stages an
-- implementation moves through) is alive and correct. `journey` in the EMAIL
-- DRIP sense is what 0012 renamed to `sequence`. These columns belong to the
-- drip, so they become sequence_id.
--
-- The compatibility views keep exposing `journey_id` by aliasing it, so any
-- reader still on the pre-0012 vocabulary is unaffected. They are dropped a
-- release later, per the ledger.
--
-- Rollback: supabase/down/0027_down.sql (renames back, restores the views).

-- ---------------------------------------------------------------------------
-- A. The columns
-- ---------------------------------------------------------------------------
-- Guarded, so this is safe to re-apply after its own down and safe against a
-- database where someone has already fixed it by hand.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'sequence_steps'
       and column_name = 'journey_id'
  ) then
    alter table sequence_steps rename column journey_id to sequence_id;
    raise notice 'renamed sequence_steps.journey_id -> sequence_id';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'sequence_enrollments'
       and column_name = 'journey_id'
  ) then
    alter table sequence_enrollments rename column journey_id to sequence_id;
    raise notice 'renamed sequence_enrollments.journey_id -> sequence_id';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- B. The compatibility views, rebuilt
-- ---------------------------------------------------------------------------
-- `select *` would now expose `sequence_id` through views whose entire purpose
-- is to speak the OLD vocabulary, so the column is aliased back explicitly.
-- Columns are named rather than starred for the same reason: a view that says
-- `*` silently changes shape the next time somebody adds a column.
--
-- security_invoker preserved from 0012: these enforce the underlying table's
-- RLS as the caller, not as the view owner.
drop view if exists journey_steps;
create view journey_steps with (security_invoker = true) as
  select id,
         org_id,
         sequence_id as journey_id,
         step_order,
         title,
         email_subject,
         email_body,
         delay_hours,
         advance_on,
         content_item_id
    from sequence_steps;

drop view if exists journey_enrollments;
create view journey_enrollments with (security_invoker = true) as
  select id,
         org_id,
         sequence_id as journey_id,
         customer_id,
         contact_id,
         contact_email,
         status,
         current_step,
         last_sent_at,
         created_at
    from sequence_enrollments;

-- `journeys` is untouched: `sequences` has no journey_id column, so that view
-- is still correct as written.
