delete from portal_pipeline_stages where key = 'field_fusion_setup';
do $$
declare
  v_keys text[];
begin
  select array_agg(key order by sort_order) into v_keys from portal_pipeline_stages;
  perform portal_set_pipeline_stage_order(v_keys);
end $$;
