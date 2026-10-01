-- Reverses 0073. The dates and outcome still live in the deals' intake JSON,
-- so dropping the columns loses nothing a re-run of 0073 cannot backfill.
-- The reasons for target moves are lost with the table.
drop table if exists public.target_date_changes;

alter table public.journal_entries drop column if exists kind;

alter table public.implementations
  drop column if exists tier_expected_date,
  drop column if exists baseline_date,
  drop column if exists baseline_locked_at,
  drop column if exists target_date,
  drop column if exists go_live_at,
  drop column if exists complete_outcome,
  drop column if exists complete_reason;

delete from public.portal_app_config where key = 'complexity_tiers';
