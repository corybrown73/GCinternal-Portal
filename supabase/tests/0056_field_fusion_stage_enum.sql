-- Probe: the enum carries the value, after closed_won.
do $$
declare
  v_won float; v_ff float;
begin
  select enumsortorder into v_won from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'portal_account_stage' and enumlabel = 'closed_won';
  select enumsortorder into v_ff from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'portal_account_stage' and enumlabel = 'field_fusion_setup';
  if v_ff is null then raise exception '0056: field_fusion_setup missing from portal_account_stage'; end if;
  if v_ff <= v_won then raise exception '0056: field_fusion_setup must sort after closed_won'; end if;
end $$;
