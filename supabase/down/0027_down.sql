-- Down for 0027_sequences_column_rename.sql
--
-- Renames the columns back and restores the views to their 0012 form. Nothing
-- is destroyed: a column rename moves no data, and the views are derived.
--
-- Note that rolling this back reintroduces the bug it fixed — the app queries
-- `sequence_id` and would 400 again. That is correct for a rollback: it returns
-- the schema to what the previous release expected. It is called out here so
-- nobody runs it expecting the /sequences page to keep working.

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'sequence_steps'
       and column_name = 'sequence_id'
  ) then
    -- The views select the column, so they have to go first.
    drop view if exists journey_steps;
    alter table sequence_steps rename column sequence_id to journey_id;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'sequence_enrollments'
       and column_name = 'sequence_id'
  ) then
    drop view if exists journey_enrollments;
    alter table sequence_enrollments rename column sequence_id to journey_id;
  end if;
end $$;

-- Back to 0012's form: a plain passthrough, since the column is journey_id
-- again on the underlying table.
drop view if exists journey_steps;
create view journey_steps with (security_invoker = true) as
  select * from sequence_steps;

drop view if exists journey_enrollments;
create view journey_enrollments with (security_invoker = true) as
  select * from sequence_enrollments;
