-- Read-only: is migration 0083 (partner implementation) in this database?
select '0083' as migration, requirement, ok from (values
  ('implementations.partner_key exists',
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'implementations' and column_name = 'partner_key')),
  ('function create_partner_implementation exists',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'create_partner_implementation')),
  ('journey_templates.journey_type allows partner_implementation',
    exists (select 1 from pg_constraint
             where conname = 'journey_templates_journey_type_check'
               and pg_get_constraintdef(oid) like '%partner_implementation%'))
) as t(requirement, ok)
