-- 0084 probes: partner progression, the Implementation Ready handoff, graduation,
-- duplicate protection and rollback. Runs in one transaction and rolls back.
begin;

do $$
declare
  v_c uuid; v_d uuid; v_d2 uuid; v_tm uuid; v_std uuid; v_res jsonb; v_impl uuid; v_impl2 uuid;
  v_n int; v_raised boolean; v_msg text; v_stage text; v_dstage text; v_at timestamptz := now();
begin
  insert into customers (name) values ('0084 probe customer') returning id into v_c;
  insert into portal_accounts (name, stage) values ('0084 probe deal', 'closed_won') returning id into v_d;
  insert into portal_accounts (name, stage) values ('0084 rollback deal', 'closed_won') returning id into v_d2;
  insert into team_members (name, role) values ('0084 TIS', 'implementation_manager') returning id into v_tm;

  v_res := create_partner_implementation(v_c, null, v_d, '0084 partner', 'field_fusion_iq', '{}'::jsonb, null, null, v_at);
  v_impl := (v_res ->> 'implementation_id')::uuid;

  -- 1. Only the next stage may be advanced to.
  v_raised := false;
  begin
    perform advance_partner_stage(v_impl, 'form_finalisation', null, null, null, v_at);
  exception when others then v_raised := sqlerrm like '%Only the next stage is allowed%';
  end;
  if not v_raised then raise exception '0084: skipping a stage was not refused'; end if;
  raise notice '0084 ok: an advance that skips a stage is refused';

  -- 2. An advisory stage advances with its open gate recorded as a gap.
  v_res := advance_partner_stage(v_impl, 'partner_setup', null, null, 'start setup', v_at);
  if not (v_res ->> 'advanced_with_gaps')::boolean then raise exception '0084: an advisory gap was not recorded'; end if;
  if (select advanced_with_gaps from implementation_stage_history
       where implementation_id = v_impl and stage = 'partner_setup' and exited_at is null) is not true then
    raise exception '0084: the history row does not record the gap';
  end if;
  if (select count(*) from implementation_stage_history where implementation_id = v_impl and exited_at is null) <> 1 then
    raise exception '0084: more than one stage is open in history';
  end if;
  raise notice '0084 ok: an advisory stage advances and records its gap';

  -- 3. Partner Setup cannot be advanced past; only the handoff moves it.
  v_raised := false;
  begin
    perform advance_partner_stage(v_impl, 'form_finalisation', null, null, null, v_at);
  exception when others then v_raised := sqlerrm like '%with the handoff%';
  end;
  if not v_raised then raise exception '0084: advancing past Partner Setup was not refused'; end if;
  raise notice '0084 ok: Partner Setup is passed only by the handoff';

  -- 4. The handoff is refused while the blocking gate is open, and nothing moves.
  v_raised := false;
  begin
    perform partner_implementation_handoff(v_impl, v_tm, null, null,
      '{"weight":1,"breakdown":{},"source":"auto","note":"rule"}'::jsonb, null, v_at);
  exception when others then v_raised := sqlerrm like '%closed_gate%';
  end;
  if not v_raised then raise exception '0084: a handoff with an open blocking gate was accepted'; end if;
  if (select current_stage from implementations where id = v_impl) <> 'partner_setup' then
    raise exception '0084: a refused handoff moved the stage';
  end if;
  if (select stage from portal_accounts where id = v_d) <> 'closed_won' then
    raise exception '0084: a refused handoff moved the deal';
  end if;
  if exists (select 1 from milestones where implementation_id = v_impl and name = 'Implementation Ready') then
    raise exception '0084: a refused handoff completed the milestone';
  end if;
  raise notice '0084 ok: a handoff with an open blocking gate is refused and changes nothing';

  -- 5. Satisfy the partner's gate, then hand off: the stage, milestone, deal, owner,
  --    ledger, outbox and events all change together.
  update work_items set status = 'done'
   where implementation_id = v_impl and is_gate
     and stage_instance_id in (select id from stage_instances where implementation_id = v_impl and stage_key = 'partner_setup');
  perform partner_implementation_handoff(v_impl, v_tm, null, null,
    '{"weight":1,"breakdown":{"base":1},"source":"auto","note":"lowest load"}'::jsonb,
    '[{"dedupe_key":"assignment:0084","to":"tis@example.test","subject":"Handed to you","html":"<p>x</p>"}]'::jsonb, v_at);
  if (select current_stage from implementations where id = v_impl) <> 'form_finalisation' then
    raise exception '0084: the handoff did not move the stage';
  end if;
  if (select stage from portal_accounts where id = v_d) <> 'onboarding_kickoff' then
    raise exception '0084: the handoff did not move the deal to onboarding_kickoff';
  end if;
  if (select status || ':' || completed_date::text from milestones
       where implementation_id = v_impl and name = 'Implementation Ready') <> 'completed:' || v_at::date::text then
    raise exception '0084: the Implementation Ready milestone was not completed on the handoff date';
  end if;
  if (select owner_id from implementations where id = v_impl) <> v_tm then
    raise exception '0084: the owner was not set';
  end if;
  if (select count(*) from portal_assignments where implementation_id = v_impl) <> 1 then
    raise exception '0084: the assignment ledger row was not written exactly once';
  end if;
  if (select count(*) from notification_outbox where dedupe_key = 'assignment:0084' and status = 'queued') <> 1 then
    raise exception '0084: the assignment notice was not queued';
  end if;
  if not exists (select 1 from integration_events where implementation_id = v_impl and event_type = 'implementation.handed_off') then
    raise exception '0084: no handoff event was written';
  end if;
  raise notice '0084 ok: the handoff commits the stage, milestone, deal, owner, ledger, notice and event together';

  -- 6. A second handoff is refused, and nothing is recorded twice.
  v_raised := false;
  begin
    perform partner_implementation_handoff(v_impl, v_tm, null, null,
      '{"weight":1,"breakdown":{},"source":"auto","note":"again"}'::jsonb,
      '[{"dedupe_key":"assignment:0084-2","to":"tis@example.test","subject":"again","html":"<p>x</p>"}]'::jsonb, v_at);
  exception when others then v_raised := sqlerrm like '%duplicate_handoff%';
  end;
  if not v_raised then raise exception '0084: a second handoff was accepted'; end if;
  if (select count(*) from portal_assignments where implementation_id = v_impl) <> 1 then
    raise exception '0084: a refused second handoff wrote a ledger row';
  end if;
  if (select count(*) from notification_outbox where implementation_id = v_impl) <> 1 then
    raise exception '0084: a refused second handoff queued a notice';
  end if;
  raise notice '0084 ok: a second handoff is refused and records nothing';

  -- 7. Rollback: a failure after the stage has moved undoes all of the handoff.
  v_res := create_partner_implementation(null, '{"name":"0084 rollback customer"}'::jsonb, v_d2,
    '0084 rollback partner', 'field_fusion_iq', '{}'::jsonb, null, null, v_at);
  v_impl2 := (v_res ->> 'implementation_id')::uuid;
  perform advance_partner_stage(v_impl2, 'partner_setup', null, null, null, v_at);
  update work_items set status = 'done'
   where implementation_id = v_impl2 and is_gate
     and stage_instance_id in (select id from stage_instances where implementation_id = v_impl2 and stage_key = 'partner_setup');
  create function probe_fail_assign() returns trigger language plpgsql as $f$
  begin raise exception '0084: forced assignment failure'; end $f$;
  create trigger probe_fail_assign before insert on portal_assignments
    for each row execute function probe_fail_assign();
  v_raised := false;
  begin
    perform partner_implementation_handoff(v_impl2, v_tm, null, null,
      '{"weight":1,"breakdown":{},"source":"auto","note":"rollback"}'::jsonb,
      '[{"dedupe_key":"assignment:0084-rollback","to":"tis@example.test","subject":"r","html":"<p>r</p>"}]'::jsonb, v_at);
  exception when others then v_raised := sqlerrm like '%forced assignment failure%';
  end;
  drop trigger probe_fail_assign on portal_assignments;
  drop function probe_fail_assign();
  if not v_raised then raise exception '0084: the forced failure did not raise'; end if;
  if (select current_stage from implementations where id = v_impl2) <> 'partner_setup' then
    raise exception '0084: a failed handoff left the stage moved';
  end if;
  if (select stage from portal_accounts where id = v_d2) <> 'closed_won' then
    raise exception '0084: a failed handoff left the deal moved';
  end if;
  if exists (select 1 from milestones where implementation_id = v_impl2 and name = 'Implementation Ready') then
    raise exception '0084: a failed handoff left the milestone completed';
  end if;
  if exists (select 1 from notification_outbox where dedupe_key = 'assignment:0084-rollback') then
    raise exception '0084: a failed handoff left a notice queued';
  end if;
  if (select count(*) from implementation_stage_history where implementation_id = v_impl2 and stage = 'form_finalisation') <> 0 then
    raise exception '0084: a failed handoff left a history row';
  end if;
  raise notice '0084 ok: a failed handoff rolls back the stage, deal, milestone, notice and history';

  -- 8. Advance the first implementation through the rest of the journey.
  perform advance_partner_stage(v_impl, 'pilot', null, null, null, v_at)
    ;
  raise notice '0084 ok: advances to Pilot once the advisory gate is passed';

  -- 9. Trial Run, then Roll Out. Advisory stages advance with gaps recorded.
  perform advance_partner_stage(v_impl, 'trial_run', null, null, null, v_at);
  perform advance_partner_stage(v_impl, 'roll_out', null, null, null, v_at);
  if (select current_stage from implementations where id = v_impl) <> 'roll_out' then
    raise exception '0084: the implementation did not reach Roll Out';
  end if;

  -- 10. Graduation is refused while its four criteria are open, and the deal stays put.
  v_raised := false;
  begin
    perform partner_implementation_graduate(v_impl, v_tm, null, v_at);
  exception when others then v_raised := sqlerrm like '%closed_gate%';
  end;
  if not v_raised then raise exception '0084: graduation with open criteria was accepted'; end if;
  if (select stage from portal_accounts where id = v_d) <> 'onboarding_kickoff' then
    raise exception '0084: a refused graduation moved the deal';
  end if;
  if (select count(*) from work_items where implementation_id = v_impl and stage_instance_id in
        (select id from stage_instances where implementation_id = v_impl and stage_key = 'roll_out')
        and is_gate) <> 4 then
    raise exception '0084: Roll Out does not carry its four criteria';
  end if;
  raise notice '0084 ok: graduation is refused while the four criteria are open';

  -- 11. Satisfy the four criteria: graduation completes the stage, the milestone,
  --     and moves the deal to onboarding_complete, in one transaction.
  update work_items set status = 'done'
   where implementation_id = v_impl and is_gate
     and stage_instance_id in (select id from stage_instances where implementation_id = v_impl and stage_key = 'roll_out');
  perform partner_implementation_graduate(v_impl, v_tm, null, v_at);
  if (select stage from portal_accounts where id = v_d) <> 'onboarding_complete' then
    raise exception '0084: graduation did not move the deal to onboarding_complete';
  end if;
  if (select status from stage_instances where implementation_id = v_impl and stage_key = 'roll_out') <> 'done' then
    raise exception '0084: graduation did not complete the Roll Out stage';
  end if;
  if (select status || ':' || completed_date::text from milestones
       where implementation_id = v_impl and name = 'Roll Out & Graduation') <> 'completed:' || v_at::date::text then
    raise exception '0084: graduation did not complete its milestone';
  end if;
  raise notice '0084 ok: graduation completes Roll Out and moves the deal to onboarding_complete';

  -- 12. A second graduation is refused.
  v_raised := false;
  begin
    perform partner_implementation_graduate(v_impl, v_tm, null, v_at);
  exception when others then v_raised := sqlerrm like '%duplicate_graduation%';
  end;
  if not v_raised then raise exception '0084: a second graduation was accepted'; end if;
  raise notice '0084 ok: a second graduation is refused';

  -- 13. A standard implementation never reaches the partner functions.
  insert into implementations (customer_id, name, current_stage, source)
  values (v_c, '0084 standard', 'handoff', 'presale') returning id into v_std;
  v_n := 0;
  begin perform advance_partner_stage(v_std, 'kickoff', null, null, null, v_at);
  exception when others then if sqlerrm like '%does not run the partner journey%' then v_n := v_n + 1; end if; end;
  begin perform partner_implementation_handoff(v_std, v_tm, null, null, '{}'::jsonb, null, v_at);
  exception when others then if sqlerrm like '%does not run the partner journey%' then v_n := v_n + 1; end if; end;
  begin perform partner_implementation_graduate(v_std, v_tm, null, v_at);
  exception when others then if sqlerrm like '%does not run the partner journey%' then v_n := v_n + 1; end if; end;
  if v_n <> 3 then raise exception '0084: a standard implementation reached a partner function (%)', v_n; end if;
  if (select current_stage from implementations where id = v_std) <> 'handoff' then
    raise exception '0084: a refused standard call moved a standard implementation';
  end if;
  raise notice '0084 ok: a standard implementation is refused by every partner function, and unchanged';
end $$;

rollback;
