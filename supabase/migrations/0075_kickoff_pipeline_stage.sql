-- 0075: Kickoff on the configured pipeline, between Pre-Kickoff and Get it
-- working. Seeded only where it is missing; the order is set with the same
-- function the admin screen uses, so the deferrable order constraint is
-- honoured and nothing else about the configured pipeline changes.
--
-- Requires 0074 (the enum value) to already exist: `enterable` on
-- portal_pipeline_stages_v is computed from pg_enum, so the row is inert
-- until then regardless of migration order, but the two belong together.
insert into portal_pipeline_stages (key, label, color, sort_order, is_won, is_terminal)
select 'kickoff', 'Kickoff', 'primary',
       (select coalesce(max(sort_order), 0) + 1 from portal_pipeline_stages), false, false
 where not exists (select 1 from portal_pipeline_stages where key = 'kickoff');

-- Place it right after Pre-Kickoff: every other stage keeps its order.
do $$
declare
  v_keys text[];
begin
  select array_agg(key order by ord)
    into v_keys
    from (
      select key,
             case
               when key = 'kickoff'
                 then (select sort_order + 0.5 from portal_pipeline_stages where key = 'onboarding_kickoff' limit 1)
               else sort_order::numeric
             end as ord
        from portal_pipeline_stages
    ) s;
  perform portal_set_pipeline_stage_order(v_keys);
end $$;
