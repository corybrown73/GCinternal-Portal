-- Invariant probes for 0092 (implementation training). Each refusal is checked for
-- its SQLSTATE and its message, so a probe fails when something refuses for the
-- wrong reason. Runs in one transaction and rolls back. Requires ON_ERROR_STOP=1.
--
-- Every write goes through the functions the application calls, so these probes test
-- the rules the application relies on, not just the table constraints.
-- Versions are fixed literals where a stale version is being tested (a touch trigger
-- would otherwise stamp every write with the same transaction time).

begin;

create function pg_temp.expect_refused(p_sql text, p_state text, p_what text, p_message text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state or sqlerrm not like p_message then
      raise exception 'INVARIANT "%" was refused with % (%), expected % matching %',
        p_what, sqlstate, sqlerrm, p_state, p_message;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT "%" was NOT refused', p_what;
end $fn$;

-- ---------------------------------------------------------------------------
-- Fixtures. Probe emails are on an allowed domain for this transaction only, as in 0091.
-- ---------------------------------------------------------------------------
insert into portal_app_config (key, value)
  values ('allowed_email_domains', '["probe.test"]'::jsonb)
  on conflict (key) do update set value = case when portal_app_config.value ? 'probe.test'
    then portal_app_config.value
    else portal_app_config.value || '["probe.test"]'::jsonb end;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-0000000000e1', 'owner92@probe.test'),
  ('a0000000-0000-4000-8000-0000000000e2', 'other92@probe.test'),
  ('a0000000-0000-4000-8000-0000000000e3', 'manager92@probe.test'),
  ('a0000000-0000-4000-8000-0000000000e4', 'customer92@probe.test'),
  ('a0000000-0000-4000-8000-0000000000e5', 'se92@probe.test');
insert into team_members (id, org_id, name, role) values
  ('70000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', 'Owner TIS 92', 'implementation'),
  ('70000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', 'Other TIS 92', 'implementation'),
  ('70000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-000000000001', 'SE 92', 'se');
delete from portal_profiles where id in ('a0000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-0000000000e2', 'a0000000-0000-4000-8000-0000000000e3', 'a0000000-0000-4000-8000-0000000000e4', 'a0000000-0000-4000-8000-0000000000e5');
insert into portal_profiles (id, email, full_name, role, team_member_id) values
  ('a0000000-0000-4000-8000-0000000000e1', 'owner92@probe.test', 'Owner TIS 92', 'implementation', '70000000-0000-4000-8000-0000000000e1'),
  ('a0000000-0000-4000-8000-0000000000e2', 'other92@probe.test', 'Other TIS 92', 'implementation', '70000000-0000-4000-8000-0000000000e2'),
  ('a0000000-0000-4000-8000-0000000000e3', 'manager92@probe.test', 'Manager 92', 'manager', null),
  ('a0000000-0000-4000-8000-0000000000e4', 'customer92@probe.test', 'Customer 92', 'customer', null),
  ('a0000000-0000-4000-8000-0000000000e5', 'se92@probe.test', 'SE 92', 'se', '70000000-0000-4000-8000-0000000000e5');

-- A deal whose purchase record has one training item and one form build.
insert into portal_accounts (id, name, stage, intake) values
  ('00000000-0000-4000-8000-00000000e001', 'Probe Deal 92', 'prospect', jsonb_build_object(
    'timeline', jsonb_build_object('services', jsonb_build_array(
      jsonb_build_object('id', 'svc-train', 'kind', 'training', 'name', 'Training', 'phase', 1),
      jsonb_build_object('id', 'svc-form', 'kind', 'paid_form', 'name', 'Form build', 'phase', 1)
    ))));

insert into customers (id, org_id, name, source, is_test, updated_at) values
  ('c0000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', 'Probe Customer 92', 'manual', false, now());
insert into implementations (id, org_id, customer_id, name, current_stage, owner_id, deal_id) values
  ('d0000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000e1', 'T1', 'build', '70000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e001'),
  ('d0000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000e1', 'T2', 'build', '70000000-0000-4000-8000-0000000000e2', null),
  ('d0000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000e1', 'T3', 'build', '70000000-0000-4000-8000-0000000000e5', null),
  ('d0000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000e1', 'T4 training only', 'build', null, null);

-- Things that belong to implementation T2, to test that T1 cannot link to them.
insert into adoption_areas (id, org_id, implementation_id, kind, name) values
  ('b0000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e2', 'workflow', 'Other area');
insert into evidence (id, org_id, implementation_id, title, type) values
  ('f0000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e2', 'Other evidence', 'note');
insert into complete_solutions (id, org_id, implementation_id, title, updated_at) values
  ('e0000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e2', 'Other solution', '2026-10-01 10:00:00+00');
insert into solution_components (id, org_id, implementation_id, complete_solution_id, category, name, updated_at) values
  ('e1000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e2', 'e0000000-0000-4000-8000-0000000000e2', 'training', 'Other training', '2026-10-01 10:00:00+00');
-- Evidence on T1, which a readiness demonstration may use.
insert into evidence (id, org_id, implementation_id, title, type) values
  ('f0000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e1', 'Own evidence', 'note');
insert into adoption_areas (id, org_id, implementation_id, kind, name) values
  ('b0000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000e1', 'workflow', 'Own area');

create temp table t_ids (name text primary key, id uuid);

-- ---------------------------------------------------------------------------
-- A. Creation and who may create
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000e1"}', true);
insert into t_ids select 'base', training_create(
  'a0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000e1',
  '{"topic":"Form basics","audience":"Crew leads","outcome":"Builds and publishes a form","method":"session"}', null);
do $$ begin
  if (select count(*) from implementation_training where topic = 'Form basics' and responsibility is null) <> 1 then
    raise exception 'INVARIANT "the owner creates a training need, with no responsibility until confirmed" failed';
  end if;
  raise notice 'ok — the owner creates a training need, responsibility unconfirmed';
end $$;

select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e2', 'd0000000-0000-4000-8000-0000000000e1', '{"topic":"x"}', null) $q$,
  '42501', 'another TIS cannot create training on an implementation they do not own', '%change the training of implementations you own%');
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e5', 'd0000000-0000-4000-8000-0000000000e3', '{"topic":"x"}', null) $q$,
  '42501', 'a technical role (se) cannot create training even on an implementation they own', '%change the training of implementations you own%');
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e4', 'd0000000-0000-4000-8000-0000000000e1', '{"topic":"x"}', null) $q$,
  '42501', 'a customer cannot create training', '%change the training of implementations you own%');
select pg_temp.expect_refused($q$ select training_create(null, 'd0000000-0000-4000-8000-0000000000e1', '{"topic":"x"}', null) $q$,
  '42501', 'a write with no person behind it is refused', '%need the person making them%');

-- A manager may change any implementation, including one with no owner (training-only).
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000e3"}', true);
insert into t_ids select 'training_only', training_create(
  'a0000000-0000-4000-8000-0000000000e3', 'd0000000-0000-4000-8000-0000000000e4',
  '{"topic":"Admin training for a training-only engagement","responsibility":"customer","responsibility_source":"tis_confirmed"}', null);
do $$ begin raise notice 'ok — a manager creates training on a training-only implementation with no owner'; end $$;

-- ---------------------------------------------------------------------------
-- B. Responsibility: contract or TIS confirmation, never assumed
-- ---------------------------------------------------------------------------
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e3', 'd0000000-0000-4000-8000-0000000000e4', '{"topic":"x","responsibility":"gocanvas"}', null) $q$,
  '22023', 'a responsibility needs its source', '%needs its source%');
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e3', 'd0000000-0000-4000-8000-0000000000e4', '{"topic":"x","responsibility":"gocanvas","responsibility_source":"sow"}', null) $q$,
  '22023', 'a SOW responsibility needs the SOW wording', '%SOW wording%');
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e3', 'd0000000-0000-4000-8000-0000000000e4', '{"topic":"x","responsibility":"vendor","responsibility_source":"tis_confirmed"}', null) $q$,
  '22023', 'responsibility is one of GoCanvas, Customer or Partner', '%GoCanvas, Customer or Partner%');
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e3', 'd0000000-0000-4000-8000-0000000000e4', '{"topic":"x","responsibility":"gocanvas","responsibility_source":"guessed"}', null) $q$,
  '22023', 'the source of a responsibility is the SOW or a TIS confirmation', '%SOW or a TIS confirmation%');

-- A SOW responsibility keeps the wording exactly as written.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000e1"}', true);
insert into t_ids select 'sow', training_create(
  'a0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000e1',
  jsonb_build_object('topic', 'Two live sessions', 'responsibility', 'gocanvas', 'responsibility_source', 'sow',
                     'sow_quote', 'GoCanvas will deliver two live training sessions.  '), null);
do $$ begin
  if (select sow_quote from implementation_training where id = (select id from t_ids where name = 'sow')) <> 'GoCanvas will deliver two live training sessions.  ' then
    raise exception 'INVARIANT "the SOW wording is kept exactly as written" failed';
  end if;
  raise notice 'ok — the SOW wording is kept exactly as written';
end $$;

-- ---------------------------------------------------------------------------
-- C. Links: purchased scope, components, adoption areas and evidence stay on this implementation
-- ---------------------------------------------------------------------------
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000e1', '{"topic":"x","purchased_service_id":"svc-form"}', null) $q$,
  '22023', 'a purchased link must be a training item', '%training item%');
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000e1', '{"topic":"x","purchased_service_id":"svc-missing"}', null) $q$,
  '22023', 'a purchased link must exist in the purchase record', '%training item%');
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e3', 'd0000000-0000-4000-8000-0000000000e2', '{"topic":"x","purchased_service_id":"svc-train"}', null) $q$,
  '22023', 'an implementation with no deal cannot link to a purchase record', '%training item%');
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000e1', '{"topic":"x","adoption_area_id":"b0000000-0000-4000-8000-0000000000e2"}', null) $q$,
  '22023', 'an adoption area must be on this implementation', '%adoption area%');
select pg_temp.expect_refused($q$ select training_create('a0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000e1', '{"topic":"x","solution_component_id":"e1000000-0000-4000-8000-0000000000e2"}', null) $q$,
  '22023', 'a solution component must be on this implementation', '%solution component%');

-- A purchased training link works where the purchase record has one.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000e1"}', true);
update implementation_training set purchased_service_id = 'svc-train' where id = (select id from t_ids where name = 'base');
do $$ begin raise notice 'ok — a purchased training link is accepted when the purchase record has it'; end $$;

-- ---------------------------------------------------------------------------
-- D. Delivered and demonstrated are separate
-- ---------------------------------------------------------------------------
select pg_temp.expect_refused($q$ select training_record_demonstration('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), 'demonstrated', null, null) $q$,
  '22023', 'readiness is shown with evidence', '%Attach the evidence%');
select pg_temp.expect_refused($q$ select training_record_demonstration('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), 'demonstrated', 'f0000000-0000-4000-8000-0000000000e2', null) $q$,
  '22023', 'readiness evidence must be on this implementation', '%not on this implementation%');

select training_record_delivery('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), date '2026-11-01', null);
do $$ begin
  if not exists (select 1 from implementation_training where id = (select id from t_ids where name = 'base')
                  and delivered_at = date '2026-11-01' and demonstrated_status = 'not_assessed') then
    raise exception 'INVARIANT "delivery is recorded without changing readiness" failed';
  end if;
  raise notice 'ok — delivery is recorded without changing readiness';
end $$;

select training_record_demonstration('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), 'demonstrated', 'f0000000-0000-4000-8000-0000000000e1', null);
do $$ begin
  if not exists (select 1 from implementation_training where id = (select id from t_ids where name = 'base')
                  and demonstrated_status = 'demonstrated' and demonstrated_evidence_id = 'f0000000-0000-4000-8000-0000000000e1'
                  and delivered_at = date '2026-11-01') then
    raise exception 'INVARIANT "readiness is shown with its evidence, and delivery is kept" failed';
  end if;
  raise notice 'ok — readiness is shown with its evidence, and delivery is kept';
end $$;

select pg_temp.expect_refused($q$ select training_record_demonstration('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), 'not_yet', null, null) $q$,
  '22023', 'moving away from demonstrated needs a reason', '%Say why readiness%');
select training_record_demonstration('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), 'practice_needed', null, 'Crew needs one more practice run');
do $$ begin
  if not exists (select 1 from implementation_training where id = (select id from t_ids where name = 'base')
                  and demonstrated_status = 'practice_needed' and demonstrated_evidence_id is null) then
    raise exception 'INVARIANT "practice needed clears the evidence link" failed';
  end if;
  raise notice 'ok — practice needed clears the evidence link, delivery is still recorded';
end $$;

-- ---------------------------------------------------------------------------
-- E. Versions, fields, archiving
-- ---------------------------------------------------------------------------
select pg_temp.expect_refused($q$ select training_update('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), '2020-01-01 00:00:00+00', '{"topic":"x"}', null) $q$,
  'P0409', 'a stale version is refused', '%changed while you were looking%');
select pg_temp.expect_refused($q$ select training_update('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), null, '{"topic":"x"}', null) $q$,
  '22023', 'a change must name the version it changes', '%version you are changing%');
select pg_temp.expect_refused($q$ select training_update('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), '{"demonstrated_status":"demonstrated"}', null) $q$,
  '22023', 'readiness cannot be set through an ordinary field update', '%Unknown training field%');
select pg_temp.expect_refused($q$ select training_update('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), '{"topic":"   "}', null) $q$,
  '22023', 'a training needs a topic', '%needs a topic%');
select pg_temp.expect_refused($q$ select training_update('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), '{"responsibility":"customer"}', null) $q$,
  '22023', 'responsibility is set together with its source', '%together%');

select training_update('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')),
  '{"responsibility":"customer","responsibility_source":"tis_confirmed"}', 'Client confirmed their admins deliver it');
do $$ begin
  if not exists (select 1 from portal_audit_log where entity_type = 'implementation_training'
                  and entity_id = (select id from t_ids where name = 'base') and action = 'training.updated'
                  and payload->'changes' ? 'responsibility') then
    raise exception 'INVARIANT "a responsibility change is recorded with its from and to" failed';
  end if;
  raise notice 'ok — a responsibility change is recorded with its from and to';
end $$;

select pg_temp.expect_refused($q$ select training_set_archived('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), true, null) $q$,
  '22023', 'archiving needs a reason', '%Say why this training is archived%');
select training_set_archived('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), true, 'Replaced by the admin session');
select pg_temp.expect_refused($q$ select training_update('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), '{"topic":"again"}', null) $q$,
  '22023', 'an archived training cannot be changed until restored', '%archived%');
select training_set_archived('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'base'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'base')), false, null);

-- ---------------------------------------------------------------------------
-- F. Transcript approval paths
-- ---------------------------------------------------------------------------
select pg_temp.expect_refused($q$ select training_demonstrate_from_transcript('a0000000-0000-4000-8000-0000000000e1', (select id from t_ids where name = 'training_only'), (select updated_at from implementation_training where id = (select id from t_ids where name = 'training_only')), '  ', null, null) $q$,
  '22023', 'a demonstration from a transcript needs its quote', '%transcript quote%');
insert into t_ids select 'from_transcript', training_demonstrate_from_transcript(
  'a0000000-0000-4000-8000-0000000000e3', (select id from t_ids where name = 'training_only'),
  (select updated_at from implementation_training where id = (select id from t_ids where name = 'training_only')),
  'Their supervisor published a form on her own with no help.', null, 'Confirmed on the call');
do $$ begin
  if not exists (select 1 from evidence where id = (select id from t_ids where name = 'from_transcript')
                  and type = 'training_readiness' and implementation_id = 'd0000000-0000-4000-8000-0000000000e4'
                  and description = 'Their supervisor published a form on her own with no help.') then
    raise exception 'INVARIANT "the transcript quote becomes readiness evidence on the same implementation" failed';
  end if;
  if not exists (select 1 from implementation_training where id = (select id from t_ids where name = 'training_only')
                  and demonstrated_status = 'demonstrated' and demonstrated_evidence_id = (select id from t_ids where name = 'from_transcript')) then
    raise exception 'INVARIANT "the transcript demonstration sets readiness and links the evidence" failed';
  end if;
  raise notice 'ok — the transcript quote becomes readiness evidence on the same implementation, and is linked';
end $$;

-- ---------------------------------------------------------------------------
-- G. Direct writes and reads
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (
    select 1 from information_schema.role_table_grants
     where grantee in ('authenticated', 'anon')
       and table_schema = 'public'
       and table_name in ('implementation_training', 'complete_solutions', 'solution_components',
                          'solution_component_dependencies', 'solution_events')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'INVARIANT "signed-in users have no direct write access to training or solution tables" failed';
  end if;
  raise notice 'ok — signed-in users have no direct write access to training or solution tables';
end $$;

-- Reads: the platform grants SELECT to signed-in users; simulate that here.
grant select on implementation_training to authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000e4"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from implementation_training) <> 0 then
    raise exception 'INVARIANT "a customer cannot read training" failed';
  end if;
end $$;
reset role;
do $$ begin raise notice 'ok — a customer login reads no training rows'; end $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000e1"}', true);
set local role authenticated;
do $$ begin
  if (select count(*) from implementation_training) < 1 then
    raise exception 'INVARIANT "an internal user reads training" failed';
  end if;
end $$;
reset role;
do $$ begin raise notice 'ok — an internal user reads training rows'; end $$;

-- ---------------------------------------------------------------------------
-- H. Stages, journey and history are untouched
-- ---------------------------------------------------------------------------
do $$ begin
  if (select current_stage from implementations where id = 'd0000000-0000-4000-8000-0000000000e1') <> 'build' then
    raise exception 'INVARIANT "training changes never change the implementation stage" failed';
  end if;
  raise notice 'ok — training changes never change the implementation stage';
end $$;

do $$ begin
  if (select count(*) from portal_audit_log
       where entity_type = 'implementation_training' and entity_id = (select id from t_ids where name = 'base')
         and action in ('training.created', 'training.updated', 'training.delivery_recorded',
                        'training.readiness_recorded', 'training.archived', 'training.restored')) < 5 then
    raise exception 'INVARIANT "each training change is recorded in the audit log" failed';
  end if;
  raise notice 'ok — each training change is recorded in the audit log';
end $$;

-- ---------------------------------------------------------------------------
-- I. Transcript proposal types
-- ---------------------------------------------------------------------------
insert into evidence_proposals (implementation_id, type, title, text, quote, training_id, training_field, training_value)
  values ('d0000000-0000-4000-8000-0000000000e1', 'training_update', 'Audience changed', 'Now field crews too',
          'Field crews will use it as well', (select id from t_ids where name = 'base'), 'audience', 'Field crews');
do $$ begin raise notice 'ok — a training_update proposal is accepted'; end $$;
insert into evidence_proposals (implementation_id, type, title, text, quote)
  values ('d0000000-0000-4000-8000-0000000000e1', 'component_update', 'Earlier type still works', '', null);
do $$ begin raise notice 'ok — the 0091 proposal types are still accepted'; end $$;
select pg_temp.expect_refused($q$ insert into evidence_proposals (implementation_id, type, title) values ('d0000000-0000-4000-8000-0000000000e1', 'training_complete', 'Not a type') $q$,
  '23514', 'an unknown proposal type is refused', '%evidence_proposals_type_check%');
select pg_temp.expect_refused($q$ insert into evidence_proposals (implementation_id, type, title, training_field) values ('d0000000-0000-4000-8000-0000000000e1', 'training_update', 'Bad field', 'demonstrated_status') $q$,
  '23514', 'a training proposal cannot name readiness as a plain field', '%training_field%');

rollback;
