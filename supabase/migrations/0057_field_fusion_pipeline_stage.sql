-- 0057: the Field Fusion setup stage on the pipeline, between Closed Won and
-- Onboarding Kickoff. Seeded only where it is missing; the order is set with
-- the same function the admin screen uses, so the deferrable order constraint
-- is honoured and nothing else about the configured pipeline changes.
insert into portal_pipeline_stages (key, label, color, sort_order, is_won, is_terminal)
select 'field_fusion_setup', 'Field Fusion setup', 'risk',
       (select coalesce(max(sort_order), 0) + 1 from portal_pipeline_stages), false, false
 where not exists (select 1 from portal_pipeline_stages where key = 'field_fusion_setup');

-- Place it right after the won stage: every other stage keeps its order.
do $$
declare
  v_keys text[];
begin
  select array_agg(key order by ord)
    into v_keys
    from (
      select key,
             case
               when key = 'field_fusion_setup'
                 then (select sort_order + 0.5 from portal_pipeline_stages where is_won limit 1)
               else sort_order::numeric
             end as ord
        from portal_pipeline_stages
    ) s;
  perform portal_set_pipeline_stage_order(v_keys);
end $$;
