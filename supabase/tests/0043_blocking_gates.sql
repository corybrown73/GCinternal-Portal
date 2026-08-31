-- Invariant probes for blocking gates and their override (0043).
--
-- The failure this guards is the one that made promoting a stage dangerous:
-- a published template being edited under projects already running on it, and
-- a "gate" that is really a wall.
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
-- A published template cannot be edited
-- ---------------------------------------------------------------------------
-- The whole reason 0043 publishes a version rather than flipping two columns.
-- Nine projects pin v2; changing it would rewrite the plan beneath them.
select pg_temp.assert_refused(
  $q$update journey_template_stages set gate_mode = 'advisory'
      where template_id = (select id from journey_templates
                            where key = 'new-logo' and version = 3)
        and stage_key = 'handoff'$q$,
  'frozen',
  'editing a stage on a published template');

-- ---------------------------------------------------------------------------
-- The two stages this migration exists for
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n
    from journey_template_stages s
    join journey_templates t on t.id = s.template_id
   where t.key = 'new-logo' and t.status = 'published' and t.superseded_by_id is null
     and s.stage_key in ('handoff', 'graduate-to-cs')
     and s.gate_mode = 'blocking';
  if n <> 2 then
    raise exception 'INVARIANT VIOLATED: expected handoff and graduate-to-cs blocking on the current new-logo, found %', n;
  end if;
  raise notice 'ok — Handoff and Handover to Customer Success both block on the current version';
end $$;

-- ...and the version it replaced is untouched, because projects are running on it.
do $$
declare n int;
begin
  select count(*) into n
    from journey_template_stages s
    join journey_templates t on t.id = s.template_id
   where t.key = 'new-logo' and t.version = 2
     and s.stage_key in ('handoff', 'graduate-to-cs')
     and s.gate_mode = 'advisory';
  if n <> 2 then
    raise exception 'INVARIANT VIOLATED: v2 was modified — expected both stages still advisory, found % ', n;
  end if;
  raise notice 'ok — v2 is unchanged; projects pinned to it keep the gates they started with';
end $$;

-- ---------------------------------------------------------------------------
-- Exactly one current version per key
-- ---------------------------------------------------------------------------
-- Two "current" rows is the state that broke the down migration twice. It is
-- an index, so this asserts the index is doing its job rather than that the
-- data happens to be right.
select pg_temp.assert_refused(
  $q$update journey_templates set superseded_by_id = null
      where key = 'new-logo' and version = 2$q$,
  'journey_templates_current_idx',
  'a second current published version of one template key');

-- ---------------------------------------------------------------------------
-- An override is recordable
-- ---------------------------------------------------------------------------
-- A gate that cannot be passed is a wall. The column exists so that leaving a
-- blocking stage early is possible, attributed and countable.
insert into customers (id, name) values
  ('43000000-0000-4000-8000-000000000001', 'Gate Probe Co');
insert into implementations (id, customer_id, name, current_stage) values
  ('43000000-0000-4000-8000-000000000002',
   '43000000-0000-4000-8000-000000000001', 'Gate probe', 'handoff');

do $$
declare v_gaps boolean; v_notes text;
begin
  insert into implementation_stage_history
    (implementation_id, stage, entered_at, notes, advanced_with_gaps)
  values ('43000000-0000-4000-8000-000000000002', 'plan-internal', now(),
          'Customer signed a letter of intent; packet follows Monday.', true);

  select advanced_with_gaps, notes into v_gaps, v_notes
    from implementation_stage_history
   where implementation_id = '43000000-0000-4000-8000-000000000002'
     and stage = 'plan-internal';

  if not v_gaps or v_notes is null then
    raise exception 'INVARIANT VIOLATED: an override must record both the flag and the reason';
  end if;
  raise notice 'ok — an override carries a flag that can be counted and words that explain it';
end $$;

-- The ordinary move is not an override, and does not have to pretend to be.
do $$
declare v_gaps boolean;
begin
  insert into implementation_stage_history (implementation_id, stage, entered_at)
  values ('43000000-0000-4000-8000-000000000002', 'align-external', now())
  returning advanced_with_gaps into v_gaps;
  if v_gaps then
    raise exception 'INVARIANT VIOLATED: a plain stage move defaulted to being an override';
  end if;
  raise notice 'ok — a clean move defaults to not-an-override';
end $$;

rollback;
