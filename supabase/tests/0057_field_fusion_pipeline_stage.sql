-- Probe: the stage is configured, enterable, and sits right after Closed Won.
do $$
declare
  v_won int; v_ff int; v_next int; v_enterable boolean;
begin
  select sort_order into v_won from portal_pipeline_stages where is_won;
  select sort_order into v_ff from portal_pipeline_stages where key = 'field_fusion_setup';
  if v_ff is null then raise exception '0057: field_fusion_setup not on the pipeline'; end if;
  if v_ff <> v_won + 1 then raise exception '0057: field_fusion_setup must follow the won stage (won %, ff %)', v_won, v_ff; end if;
  select enterable into v_enterable from portal_pipeline_stages_v where key = 'field_fusion_setup';
  if not coalesce(v_enterable, false) then raise exception '0057: field_fusion_setup is not enterable (0056 missing?)'; end if;
end $$;
