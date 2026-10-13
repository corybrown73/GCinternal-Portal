-- 0083 probes: the partner journey storage and its atomic start. Runs inside a
-- transaction and rolls back, so it leaves no fixture rows behind.
begin;

-- Fixtures: one customer, one deal on the close.
do $$
declare v_c uuid; v_d uuid; v_n int; v_impl uuid; v_before int; v_raised boolean; v_res jsonb;
begin
  insert into customers (name) values ('0083 probe customer') returning id into v_c;
  insert into portal_accounts (name, stage) values ('0083 probe deal', 'closed_won') returning id into v_d;

  -- 1. partner_key is a format, not a list: a new partner needs no migration.
  insert into implementations (customer_id, name, current_stage, partner_key)
  values (v_c, '0083 new partner', 'handoff', 'acme_partner');
  begin
    insert into implementations (customer_id, name, current_stage, partner_key)
    values (v_c, '0083 bad key', 'handoff', 'Bad Key!');
    raise exception '0083: an invalid partner key was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into implementations (customer_id, name, current_stage, partner_key)
    values (v_c, '0083 digit key', 'handoff', '1abc');
    raise exception '0083: a key starting with a digit was accepted';
  exception when check_violation then null;
  end;
  raise notice '0083 ok: partner_key accepts a new partner key and refuses malformed ones';

  -- 2. The template is published, complete, and every task is unscheduled.
  select count(*) into v_n from journey_templates t
   where t.key = 'partner-implementation' and t.status = 'published' and t.superseded_by_id is null
     and t.journey_type = 'partner_implementation';
  if v_n <> 1 then raise exception '0083: expected one live partner template, found %', v_n; end if;
  select count(*) into v_n from journey_template_stages s
    join journey_templates t on t.id = s.template_id where t.key = 'partner-implementation';
  if v_n <> 6 then raise exception '0083: expected 6 template stages, found %', v_n; end if;
  select count(*) into v_n from journey_template_tasks k
    join journey_templates t on t.id = k.template_id
   where t.key = 'partner-implementation' and k.offset_basis = 'unscheduled';
  if v_n <> 20 then raise exception '0083: expected 20 unscheduled tasks, found %', v_n; end if;
  raise notice '0083 ok: template is published with 6 stages and 20 unscheduled tasks';

  -- 3. Published content is frozen.
  begin
    update journey_template_tasks set title = 'changed' where task_key = 'ps.solution_configured';
    raise exception '0083: a published task was edited';
  exception when others then
    if sqlerrm like '0083:%' then raise; end if;
  end;
  raise notice '0083 ok: published template content is frozen';

  -- 4. Starting a partner implementation generates its stages and undated work.
  v_res := create_partner_implementation(v_c, null, v_d, '0083 partner', 'field_fusion_iq',
    '{"sow_reference":"SOW-0083"}'::jsonb, null, null, now());
  v_impl := (v_res ->> 'implementation_id')::uuid;
  if (v_res ->> 'customer_created')::boolean then
    raise exception '0083: an existing customer was reported as created';
  end if;
  if (select current_stage from implementations where id = v_impl) <> 'closed_won_planning' then
    raise exception '0083: a partner implementation did not open on closed_won_planning';
  end if;
  if (select partner_key || '/' || journey_type from implementations where id = v_impl)
     <> 'field_fusion_iq/partner_implementation' then
    raise exception '0083: partner or journey type was not recorded';
  end if;
  select count(*) into v_n from stage_instances where implementation_id = v_impl;
  if v_n <> 6 then raise exception '0083: expected 6 stage instances, found %', v_n; end if;
  select count(*) into v_n from work_items where implementation_id = v_impl;
  if v_n <> 20 then raise exception '0083: expected 20 work items, found %', v_n; end if;
  select count(*) into v_n from work_items where implementation_id = v_impl and due_at is not null;
  if v_n <> 0 then raise exception '0083: % work item(s) were dated by the template', v_n; end if;
  -- A recorded launch date must not date any task either.
  update implementations set target_launch_date = '2026-12-01' where id = v_impl;
  select count(*) into v_n from work_items where implementation_id = v_impl and due_at is not null;
  if v_n <> 0 then raise exception '0083: a recorded launch date dated % task(s)', v_n; end if;
  raise notice '0083 ok: a started partner implementation has 6 stages and 20 undated tasks';

  -- 5. A missing template refuses, and nothing is written. The live template is
  -- superseded by a real draft for the duration of the probe.
  v_before := (select count(*) from implementations where customer_id = v_c);
  insert into journey_templates (key, version, name, journey_type, status)
  values ('0083-probe-successor', 1, 'probe', 'new_logo', 'draft') returning id into v_impl;
  update journey_templates set superseded_by_id = v_impl
   where key = 'partner-implementation' and superseded_by_id is null;
  v_raised := false;
  begin
    perform create_partner_implementation(v_c, null, v_d, '0083 refused', 'field_fusion_iq', '{}'::jsonb, null, null, now());
  exception when others then
    v_raised := sqlerrm like '%is not published%';
  end;
  if not v_raised then raise exception '0083: a start with no live template did not refuse for that reason'; end if;
  update journey_templates set superseded_by_id = null
   where key = 'partner-implementation' and superseded_by_id = v_impl;
  delete from journey_templates where id = v_impl;
  if (select count(*) from implementations where customer_id = v_c) <> v_before then
    raise exception '0083: a refused start left an implementation behind';
  end if;
  raise notice '0083 ok: a missing template refuses and writes nothing';

  -- 6. A template that fails to apply rolls back the implementation and its history.
  v_before := (select count(*) from implementations where customer_id = v_c);
  create function probe_fail_work_items() returns trigger language plpgsql as $f$
  begin raise exception '0083: forced apply failure'; end $f$;
  create trigger probe_fail before insert on work_items
    for each row execute function probe_fail_work_items();
  v_raised := false;
  begin
    perform create_partner_implementation(v_c, null, v_d, '0083 partial', 'field_fusion_iq', '{}'::jsonb, null, null, now());
  exception when others then
    v_raised := sqlerrm like '%forced apply failure%';
  end;
  if not v_raised then raise exception '0083: the apply failure did not come from the forced fault'; end if;
  drop trigger probe_fail on work_items;
  drop function probe_fail_work_items();
  if (select count(*) from implementations where customer_id = v_c) <> v_before then
    raise exception '0083: a failed apply left an implementation behind';
  end if;
  if (select count(*) from implementation_stage_history h
        join implementations i on i.id = h.implementation_id
       where i.customer_id = v_c and i.name = '0083 partial') <> 0 then
    raise exception '0083: a failed apply left stage history behind';
  end if;
  raise notice '0083 ok: a template that fails to apply leaves nothing behind';

  -- 8. A new customer is created in the same transaction, with its fields.
  v_res := create_partner_implementation(null, '{"name":"0083 new customer","arr":"1500.5","industry":"Pools"}'::jsonb,
    v_d, '0083 new customer impl', 'field_fusion_iq', '{}'::jsonb, null, null, now());
  if not (v_res ->> 'customer_created')::boolean then
    raise exception '0083: a new customer was not reported as created';
  end if;
  if not exists (select 1 from customers c where c.id = (v_res ->> 'customer_id')::uuid
                    and c.name = '0083 new customer' and c.arr = 1500.5 and c.industry = 'Pools') then
    raise exception '0083: the new customer did not keep its fields';
  end if;
  if not exists (select 1 from implementations i where i.id = (v_res ->> 'implementation_id')::uuid
                    and i.customer_id = (v_res ->> 'customer_id')::uuid) then
    raise exception '0083: the implementation is not linked to the new customer';
  end if;
  raise notice '0083 ok: a new customer is created with its fields and linked to the implementation';

  -- 9. A failed apply after the customer was created rolls the customer back too.
  v_before := (select count(*) from customers where name = '0083 orphan probe');
  create function probe_fail_orphan() returns trigger language plpgsql as $f$
  begin raise exception '0083: forced orphan failure'; end $f$;
  create trigger probe_fail_orphan before insert on work_items
    for each row execute function probe_fail_orphan();
  v_raised := false;
  begin
    perform create_partner_implementation(null, '{"name":"0083 orphan probe"}'::jsonb,
      v_d, '0083 orphan impl', 'field_fusion_iq', '{}'::jsonb, null, null, now());
  exception when others then
    v_raised := sqlerrm like '%forced orphan failure%';
  end;
  drop trigger probe_fail_orphan on work_items;
  drop function probe_fail_orphan();
  if not v_raised then raise exception '0083: the orphan probe did not fail for the forced reason'; end if;
  if (select count(*) from customers where name = '0083 orphan probe') <> v_before then
    raise exception '0083: a failed start left a customer behind';
  end if;
  raise notice '0083 ok: a failed start leaves no customer behind';

  -- 10. A new customer without a name is refused, and nothing is written.
  v_raised := false;
  begin
    perform create_partner_implementation(null, '{"arr":"10"}'::jsonb,
      v_d, '0083 nameless', 'field_fusion_iq', '{}'::jsonb, null, null, now());
  exception when others then
    v_raised := sqlerrm like '%needs a name%';
  end;
  if not v_raised then raise exception '0083: a nameless customer was not refused for that reason'; end if;
  raise notice '0083 ok: a nameless new customer is refused';
end $$;

rollback;
