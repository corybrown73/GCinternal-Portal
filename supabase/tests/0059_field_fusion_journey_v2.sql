-- Probe: exactly one live field-fusion template, version 2, with three training calls.
do $$
declare
  v_tid uuid; v_calls int;
begin
  if (select count(*) from journey_templates where key = 'field-fusion' and status = 'published' and superseded_by_id is null) <> 1 then
    raise exception '0059: expected exactly one live field-fusion template';
  end if;
  select id into v_tid from journey_templates where key = 'field-fusion' and status = 'published' and superseded_by_id is null;
  if (select version from journey_templates where id = v_tid) <> 2 then raise exception '0059: live version is not 2'; end if;
  select count(*) into v_calls from journey_template_tasks where template_id = v_tid and task_key in ('nl.kickoff_call','ff.second_call','ff.third_call');
  if v_calls <> 3 then raise exception '0059: expected three training-call tasks, found %', v_calls; end if;
end $$;
