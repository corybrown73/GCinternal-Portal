-- Down for 0010_account_model.sql
--
-- STOP — read before running against an environment with real data.
--
-- `health_recorded*` values are genuine human statements: 0010 deliberately
-- performed no backfill, so every non-null value was typed by a person. This
-- script therefore refuses to run until those rows have been exported, and it
-- records the removal in the audit trail rather than silently forgetting it.
--
-- To export first:
--   \copy (select id, health_recorded, health_recorded_reason, health_recorded_by,
--          health_recorded_at from implementations where health_recorded is not null)
--     to 'health_recorded_export.csv' csv header
-- then re-run confirming the export:
--   PGOPTIONS="-c down.health_export_confirmed=1" psql "$DB_URL" -f 0010_down.sql
--
-- Hand-entered salesforce_account_id values (those not reproducible from the
-- portal_accounts backfill) should be exported the same way if any exist.

do $$
declare
  recorded_count int;
  confirmed text := coalesce(current_setting('down.health_export_confirmed', true), '');
begin
  select count(*) into recorded_count from implementations where health_recorded is not null;
  if recorded_count > 0 and confirmed <> '1' then
    raise exception
      'Refusing to drop % recorded health value(s): export them first, then set down.health_export_confirmed=1',
      recorded_count;
  end if;

  -- Record the removal so the trail shows the values that left, not nothing.
  insert into audit_log (entity_type, entity_id, field_name, old_value, new_value, change_reason)
  select 'implementation', id, 'health_recorded', health_recorded, null,
         'health_recorded dropped by 0010 rollback; value preserved in export'
    from implementations
   where health_recorded is not null;
end $$;

drop trigger if exists implementations_parent_guard_trg on implementations;
drop function if exists implementations_parent_guard();

drop index if exists implementations_parent_idx;
drop index if exists implementations_sf_opportunity_idx;

alter table implementations
  drop column if exists health_computed_inputs,
  drop column if exists health_computed_at,
  drop column if exists health_computed,
  drop column if exists health_recorded_at,
  drop column if exists health_recorded_by,
  drop column if exists health_recorded_reason,
  drop column if exists health_recorded,
  drop column if exists salesforce_opportunity_id,
  drop column if exists parent_implementation_id;

alter table portal_profiles drop column if exists team_member_id;

drop index if exists customers_sf_account_idx;
alter table customers
  drop column if exists csm_owner_id,
  drop column if exists salesforce_account_id;

delete from portal_app_config where key = 'v2_flags';
