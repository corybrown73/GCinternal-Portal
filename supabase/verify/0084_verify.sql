-- Read-only: is migration 0084 (partner progression) in this database?
select '0084' as migration, requirement, ok from (values
  ('table notification_outbox exists',
    exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'notification_outbox')),
  ('function advance_partner_stage exists',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'advance_partner_stage')),
  ('function partner_implementation_graduate exists',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'partner_implementation_graduate')),
  ('function claim_notices exists',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'claim_notices')),
  ('trigger work_items_partner_gate_skip_guard exists',
    exists (select 1 from pg_trigger where tgname = 'work_items_partner_gate_skip_guard' and not tgisinternal))
) as t(requirement, ok)
