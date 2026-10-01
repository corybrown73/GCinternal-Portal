-- 0072: the five stages on the pipeline, and every deal placed in the one
-- its record has earned.
--
-- 1. Pipeline rows for Get it working, Make it yours, Make it run, placed
--    after Pre-Kickoff; Pre-Kickoff and Implementation Complete relabelled
--    (a label an operator renamed by hand is left alone).
-- 2. Every deal in the retired "in_onboarding" moves to the stage its plan
--    says: Stage 3 held or Functional reached → Make it run; Stage 2 held
--    or the form proven → Make it yours; else Get it working. The move is a
--    system transition row, and the day it entered its stage is kept so
--    "days in stage" stays honest.
-- 3. The retired row goes (the delete guard requires no account in it).
-- 4. The implementation's journey is clamped into the new bands
--    (lib/journey-for-deal.ts), the 0068 way.
insert into portal_pipeline_stages (key, label, color, sort_order, is_won, is_terminal)
select v.key, v.label, 'primary',
       (select coalesce(max(sort_order), 0) from portal_pipeline_stages) + v.n, false, false
  from (values ('get_it_working', 'Get it working', 1),
               ('make_it_yours', 'Make it yours', 2),
               ('make_it_run', 'Make it run', 3)) as v(key, label, n)
 where not exists (select 1 from portal_pipeline_stages p where p.key = v.key);

update portal_pipeline_stages set label = 'Pre-Kickoff'
 where key = 'onboarding_kickoff' and label in ('Pre-kickoff', 'Onboarding Kickoff');
update portal_pipeline_stages set label = 'Implementation Complete'
 where key = 'onboarding_complete' and label = 'Onboarding Complete';

-- 2. The data move.
do $$
declare
  r record;
  v_target portal_account_stage;
begin
  perform set_config('app.allow_stage_change', 'on', true);
  for r in
    select id, stage_entered_at, intake from portal_accounts where stage = 'in_onboarding'
  loop
    if (r.intake -> 'timeline' -> 'completed') ? 'live'
       or (r.intake -> 'timeline' -> 'completed') ? 'adjust' then
      v_target := 'make_it_run';
    elsif (r.intake -> 'timeline' -> 'completed') ? 'working'
       or (r.intake -> 'timeline' ->> 'form_proven_on') is not null then
      v_target := 'make_it_yours';
    else
      v_target := 'get_it_working';
    end if;
    update portal_accounts set stage = v_target where id = r.id;
    insert into portal_stage_transitions
      (account_id, from_stage, to_stage, source, actor_profile_id, actor_api_key_id, note, occurred_at)
    values
      (r.id, 'in_onboarding', v_target, 'system', null, null,
       'Five-stage model (0072): placed by what the plan records', now());
  end loop;
  perform set_config('app.allow_stage_change', '', true);
end $$;

-- 3. The retired row, then the order.
delete from portal_pipeline_stages where key = 'in_onboarding';
do $$
declare
  v_keys text[];
begin
  select array_agg(key order by ord)
    into v_keys
    from (
      select key,
             case key
               when 'get_it_working' then (select sort_order + 0.25 from portal_pipeline_stages where key = 'onboarding_kickoff')
               when 'make_it_yours'  then (select sort_order + 0.50 from portal_pipeline_stages where key = 'onboarding_kickoff')
               when 'make_it_run'    then (select sort_order + 0.75 from portal_pipeline_stages where key = 'onboarding_kickoff')
               else sort_order::numeric
             end as ord
        from portal_pipeline_stages
    ) s;
  perform portal_set_pipeline_stage_order(v_keys);
end $$;

-- 4. The journey inside the new bands.
--   get_it_working: plan-internal .. build
--   make_it_yours:  build .. validate-iterate
--   make_it_run:    validate-iterate .. adopt
do $$
declare
  r record;
  v_target text;
  v_at timestamptz := now();
  v_order text[] := array['handoff','plan-internal','align-external','build','validate-iterate','launch','adopt','graduate-to-cs'];
  v_floor text; v_ceil text; v_pos int; v_fpos int; v_cpos int;
begin
  for r in
    select i.id as impl_id, i.current_stage, a.stage as deal_stage
    from public.implementations i
    join public.portal_accounts a on a.id = i.deal_id
    where i.superseded_by_implementation_id is null
      and a.stage in ('get_it_working','make_it_yours','make_it_run')
  loop
    v_floor := case r.deal_stage when 'get_it_working' then 'plan-internal' when 'make_it_yours' then 'build' else 'validate-iterate' end;
    v_ceil  := case r.deal_stage when 'get_it_working' then 'build' when 'make_it_yours' then 'validate-iterate' else 'adopt' end;
    v_pos  := array_position(v_order, r.current_stage);
    v_fpos := array_position(v_order, v_floor);
    v_cpos := array_position(v_order, v_ceil);
    v_target := null;
    if v_pos is null or v_pos < v_fpos then v_target := v_floor;
    elsif v_pos > v_cpos then v_target := v_ceil;
    end if;
    if v_target is not null then
      update public.implementation_stage_history
         set exited_at = v_at
       where implementation_id = r.impl_id and exited_at is null;
      insert into public.implementation_stage_history (implementation_id, stage, entered_at, notes, exited_at)
      values (r.impl_id, v_target, v_at, 'Mirrored from the deal (five stages, 0072)', null);
      update public.implementations
         set current_stage = v_target, stage_entered_at = v_at, updated_at = v_at
       where id = r.impl_id;
      perform public.resync_stage_instances(r.impl_id);
    end if;
  end loop;
end $$;
