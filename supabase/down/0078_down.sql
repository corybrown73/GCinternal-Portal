-- Reverses 0078. The override itself still lives in the deal's intake JSON
-- (unchanged by this migration), so dropping these loses only the recorded
-- reasons, actors and baselines for past moves — not the current dates.
drop function if exists public.portal_record_milestone_date_change(
  uuid, text, date, date, text, uuid, boolean, jsonb
);
drop table if exists public.portal_milestone_date_changes;
drop table if exists public.portal_milestone_date_baselines;
