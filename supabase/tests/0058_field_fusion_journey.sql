-- Probe: the template is published with the eight lifecycle stage keys, in order.
do $$
declare
  v_tid uuid; v_keys text[];
begin
  select id into v_tid from journey_templates where key = 'field-fusion' and status = 'published' and superseded_by_id is null;
  if v_tid is null then raise exception '0058: no published field-fusion template'; end if;
  select array_agg(stage_key order by position) into v_keys from journey_template_stages where template_id = v_tid;
  if v_keys <> array['handoff','plan-internal','align-external','build','validate-iterate','launch','adopt','graduate-to-cs'] then
    raise exception '0058: stage keys are %, expected the lifecycle order', v_keys;
  end if;
  if (select count(*) from journey_template_tasks where template_id = v_tid) < 20 then
    raise exception '0058: tasks missing';
  end if;
end $$;
