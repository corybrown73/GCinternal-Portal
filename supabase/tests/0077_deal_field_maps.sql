-- Probe for 0077: the constraint accepts inbound_deal, and still refuses a
-- value nobody defined. Nothing is left behind.
do $$
begin
  insert into integration_field_maps (direction, source_path, target_field, transform, fill_policy)
  values ('inbound_deal', 'probe.TIS_Assigned__r.Email', 'implementation_owner', 'lowercase', 'never');
  delete from integration_field_maps where source_path = 'probe.TIS_Assigned__r.Email';
  begin
    insert into integration_field_maps (direction, source_path, target_field)
    values ('sideways', 'probe', 'probe');
    raise exception '0077: the direction constraint accepted an undefined value';
  exception when check_violation then
    null;
  end;
  raise notice 'probe 0077 ok';
end $$;
