-- Invariant probes for stage gates (0034) and account files (0035).
--
-- The gate flag decides whether a project can leave a stage, so the thing that
-- must hold is that it arrives on live work items by itself. A gate that
-- silently fails to copy does not error — it produces a stage with fewer
-- criteria than it should have, which reads as "ready to advance" when it is
-- not. That is a wrong answer delivered confidently, and no other test would
-- catch it.
--
-- Runs inside one transaction and rolls back. Requires ON_ERROR_STOP=1.

begin;

create function pg_temp.assert_refused(p_sql text, p_fragment text, p_what text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'INVARIANT "%" was refused, but for the wrong reason. Expected "%", got: %',
        p_what, p_fragment, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT NOT ENFORCED: % was allowed', p_what;
end $fn$;

-- ---------------------------------------------------------------------------
-- Exactly three gates per stage of New Logo
-- ---------------------------------------------------------------------------
-- Three is the product decision, not an accident of which keys were listed. If
-- a later template edit takes a stage to two or four, the exit condition for
-- that stage has quietly changed and somebody should have said so.
do $$
declare v_bad text;
begin
  select string_agg(format('%s has %s', stage_key, n), ', ')
    into v_bad
    from (
      select s.stage_key, count(*) filter (where k.is_gate) as n
        from journey_template_stages s
        join journey_templates t on t.id = s.template_id
        left join journey_template_tasks k on k.template_stage_id = s.id
       where t.key = 'new-logo' and t.version = 2
       group by s.stage_key
    ) x
   where n <> 3;
  if v_bad is not null then
    raise exception 'INVARIANT NOT ENFORCED: stages without exactly 3 gates: %', v_bad;
  end if;
  raise notice 'ok — every New Logo stage has exactly three core criteria';
end $$;

-- ---------------------------------------------------------------------------
-- A gate flag reaches a live work item on its own
-- ---------------------------------------------------------------------------
insert into customers (id, name)
  values ('66666666-1111-4111-8111-000000000001', 'Gate Probe Co');
insert into implementations (id, customer_id, name, current_stage, stage_entered_at)
  values ('66666666-2222-4222-8222-000000000001',
          '66666666-1111-4111-8111-000000000001', 'Gate probe', 'handoff', now());
insert into implementation_stage_history (implementation_id, stage, entered_at)
  values ('66666666-2222-4222-8222-000000000001', 'handoff', now());

do $$
declare v2_id uuid; res jsonb; n_gates int; n_total int;
begin
  select id into v2_id from journey_templates
   where key = 'new-logo' and version = 2 and status = 'published';
  res := apply_journey_template('66666666-2222-4222-8222-000000000001', v2_id);
  if not (res ->> 'applied')::boolean then
    raise exception 'FIXTURE BROKEN: %', res;
  end if;

  select count(*) filter (where is_gate), count(*)
    into n_gates, n_total
    from work_items where implementation_id = '66666666-2222-4222-8222-000000000001';

  -- 8 stages x 3 gates. Nothing in the application copied this; the trigger did.
  if n_gates <> 24 then
    raise exception
      'INVARIANT NOT ENFORCED: expected 24 gate items on a full plan, got % (of % items)',
      n_gates, n_total;
  end if;
  raise notice 'ok — gates arrive on live work items without the app copying them (% of %)',
    n_gates, n_total;
end $$;

-- A hand-created work item is never a gate by accident.
do $$
declare v_is_gate boolean;
begin
  insert into work_items (implementation_id, title, position)
    values ('66666666-2222-4222-8222-000000000001', 'Something somebody typed', 99)
    returning is_gate into v_is_gate;
  if v_is_gate then
    raise exception
      'INVARIANT NOT ENFORCED: a hand-created work item became a gate on its own';
  end if;
  raise notice 'ok — a hand-created item is not a gate unless somebody says so';
end $$;

-- ---------------------------------------------------------------------------
-- account_files: exactly one location
-- ---------------------------------------------------------------------------
-- A row with neither location looks like an attachment in every list and fails
-- only when somebody clicks it. A row with both has two sources of truth for
-- one artefact and no rule for which a download should use.
select pg_temp.assert_refused(
  $q$insert into account_files (implementation_id, title)
     values ('66666666-2222-4222-8222-000000000001', 'Points at nothing')$q$,
  'account_files_one_location',
  'an attachment with neither a file nor a link');

select pg_temp.assert_refused(
  $q$insert into account_files (implementation_id, title, storage_path, external_url)
     values ('66666666-2222-4222-8222-000000000001', 'Both', 'sow/x.pdf', 'https://example.com')$q$,
  'account_files_one_location',
  'an attachment that is both a file and a link');

select pg_temp.assert_refused(
  $q$insert into account_files (implementation_id, title, external_url)
     values ('66666666-2222-4222-8222-000000000001', '   ', 'https://example.com')$q$,
  'account_files_title_check',
  'an attachment titled only with whitespace');

select pg_temp.assert_refused(
  $q$insert into account_files (implementation_id, title, kind, external_url)
     values ('66666666-2222-4222-8222-000000000001', 'Odd', 'invoice', 'https://example.com')$q$,
  'account_files_kind_check',
  'an attachment of a kind nothing knows how to group');

do $$
begin
  insert into account_files (implementation_id, title, kind, external_url)
    values ('66666666-2222-4222-8222-000000000001', 'Discovery board', 'board',
            'https://miro.com/app/board/abc');
  insert into account_files (implementation_id, title, kind, storage_path, content_type)
    values ('66666666-2222-4222-8222-000000000001', 'Signed SOW', 'sow',
            'sow/2b7a-signed.pdf', 'application/pdf');
  raise notice 'ok — a link and a file both store cleanly';
end $$;

-- Deleting the project takes its file records with it. An orphaned attachment
-- row pointing at a deleted implementation is unreachable and unlistable.
do $$
declare n int;
begin
  delete from implementations where id = '66666666-2222-4222-8222-000000000001';
  select count(*) into n from account_files
   where implementation_id = '66666666-2222-4222-8222-000000000001';
  if n > 0 then
    raise exception 'INVARIANT NOT ENFORCED: % attachment row(s) outlived their project', n;
  end if;
  raise notice 'ok — attachments do not outlive the project they belong to';
end $$;

rollback;
