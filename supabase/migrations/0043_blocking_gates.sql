-- 0043 — Handoff and Handover to Customer Success become blocking gates,
-- and an override becomes a thing the record can hold.
--
-- WHY THE COLUMN COMES FIRST. Promoting a stage to `blocking` is only safe
-- once leaving it with work outstanding is possible AND recorded. Before this,
-- `blocking` meant a dead end: canAdvance said no and needsOverride also said
-- no, so there was no override path at all and the panel rendered a
-- permanently disabled button. Exactly one stage in one template was blocking
-- and nothing had reached it, so nobody had hit the wall. Promoting Handoff
-- without fixing that would have hard-locked every new project at its first
-- stage.
--
-- A gate nobody can pass stops being a gate and becomes a wall. The app's
-- standing position is that it records what happened rather than refusing to
-- let people describe reality — so every stage can always be left, and the
-- gate mode decides the ceremony. Advisory: confirm. Blocking: confirm, and
-- say why, in your own words, against your name.

-- ---------------------------------------------------------------------------
-- The override, on the row that already records the move
-- ---------------------------------------------------------------------------
-- `notes` has been there since 0003 and universally empty; it now carries the
-- stated reason. The flag sits beside it because the two answer different
-- questions: the words say why, the boolean makes "how often does this happen"
-- countable without parsing prose.
alter table implementation_stage_history
  add column if not exists advanced_with_gaps boolean not null default false;

comment on column implementation_stage_history.advanced_with_gaps is
  'This move left core criteria outstanding. `notes` carries the reason the person gave; `entered_by` is who gave it.';

create index if not exists stage_history_overrides_idx
  on implementation_stage_history (implementation_id, entered_at desc)
  where advanced_with_gaps;

-- ---------------------------------------------------------------------------
-- New Logo v3
-- ---------------------------------------------------------------------------
-- A NEW VERSION, never an edit. Nine implementations pin v2 through
-- journey_instantiations, and mutating a published template would rewrite the
-- plan under projects already running against it — the triggers in 0013 refuse
-- it outright, which is the schema saying the same thing.
--
-- Cloned exactly, with two stages promoted. Existing projects keep v2 and its
-- advisory gates; new ones get v3. That is the intended consequence of pinning
-- and is stated here rather than discovered later: this migration changes
-- nothing for work already in flight.
do $$
declare
  v_src   uuid;
  v_draft uuid;
  v_ver   int;
  v_org   uuid;
  v_stage record;
  v_new_stage uuid;
begin
  select id, version, org_id into v_src, v_ver, v_org
    from journey_templates
   where key = 'new-logo' and status = 'published' and superseded_by_id is null;

  if v_src is null then
    raise notice '0043: no published new-logo template; nothing to promote';
    return;
  end if;

  if exists (select 1 from journey_templates
              where key = 'new-logo' and org_id = v_org and status = 'draft') then
    raise exception '0043: new-logo already has an open draft. Publish or discard it first.';
  end if;

  insert into journey_templates
    (org_id, key, version, name, journey_type, status, description, default_for, version_note, created_at, updated_at)
  select org_id, key, v_ver + 1, name, journey_type, 'draft', description, default_for,
         'Handoff and Handover to Customer Success promoted to blocking gates. Leaving either with core criteria outstanding now needs a stated reason, recorded against the person who gave it.',
         now(), now()
    from journey_templates where id = v_src
  returning id into v_draft;

  -- Stages, then that stage's tasks, so the task rows can point at the new
  -- stage id rather than the source one.
  for v_stage in
    select * from journey_template_stages where template_id = v_src order by position
  loop
    insert into journey_template_stages
      (org_id, template_id, position, stage_key, name, phase, purpose, target_duration_days,
       entry_criteria, exit_criteria, gate_mode, required_artifacts, source_block_id, created_at)
    values
      (v_stage.org_id, v_draft, v_stage.position, v_stage.stage_key, v_stage.name, v_stage.phase,
       v_stage.purpose, v_stage.target_duration_days, v_stage.entry_criteria, v_stage.exit_criteria,
       case when v_stage.stage_key in ('handoff', 'graduate-to-cs') then 'blocking'
            else v_stage.gate_mode end,
       v_stage.required_artifacts, v_stage.source_block_id, now())
    returning id into v_new_stage;

    insert into journey_template_tasks
      (org_id, template_id, template_stage_id, position, task_key, title, description, role_key,
       party, visibility, offset_basis, offset_days, duration_days, is_optional, include_when,
       depends_on_keys, is_gate, created_at)
    select org_id, v_draft, v_new_stage, position, task_key, title, description, role_key,
           party, visibility, offset_basis, offset_days, duration_days, is_optional, include_when,
           depends_on_keys, is_gate, now()
      from journey_template_tasks
     where template_stage_id = v_stage.id
     order by position;
  end loop;

  -- Through the same RPC the Templates screen uses, so the supersede chain and
  -- the published_at stamp are written by the one function that owns them.
  perform publish_template(v_draft, null, null);

  -- 'system' rather than a person: nobody clicked this, and attributing it to
  -- whoever happened to run the migration would be the kind of invented
  -- provenance the rest of this schema refuses.
  insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
  values ('system', 'template.published', 'journey_template', v_draft,
          jsonb_build_object(
            'key', 'new-logo',
            'version', v_ver + 1,
            'via', 'migration 0043',
            'promoted_to_blocking', jsonb_build_array('handoff', 'graduate-to-cs')));

  raise notice '0043: published new-logo v% with handoff and graduate-to-cs blocking', v_ver + 1;
end $$;
