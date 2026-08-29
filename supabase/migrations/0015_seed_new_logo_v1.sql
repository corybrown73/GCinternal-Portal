-- 0015 — Seed the New Logo template and backfill existing implementations.
--
-- New Logo v1 is the CURRENT lifecycle expressed as data: the 8 stage ids from
-- src/lifecycle.ts, verbatim, with their labels and phases. Stages only — zero
-- tasks, zero scoping questions. That is precisely what makes the backfill
-- provably behaviour-preserving: nothing gains work it did not have.
--
-- Durations are left null rather than invented. A made-up "14 days" would be
-- indistinguishable from a measured one once it is in the table.
--
-- The Launch gate ships BLOCKING because it already is: launch-gate.ts enforces
-- technical-solution acceptance server-side today, and a migration must not
-- quietly relax a live control. Every other stage is advisory, matching
-- today's behaviour exactly.
--
-- Rollback: supabase/down/0015_down.sql

insert into journey_roles (key, name, party, description) values
  ('implementation_manager', 'Implementation Manager', 'internal', 'Owns delivery of the plan.'),
  ('solutions_engineer', 'Solutions Engineer', 'internal', 'Owns the technical solution.'),
  ('sales_owner', 'Sales Owner', 'internal', 'Owned the deal; holds the promises made.'),
  ('cs_owner', 'Customer Success Owner', 'internal', 'Takes the account on at graduation.'),
  ('customer_champion', 'Customer Champion', 'customer', 'The customer-side owner of the project.'),
  ('customer_data_owner', 'Customer Data Owner', 'customer', 'Owns the customer-side data work.')
on conflict (org_id, key) do nothing;

do $$
declare
  tpl_id uuid;
begin
  insert into journey_templates (key, version, name, journey_type, status, description, version_note)
  values ('new-logo', 1, 'New Logo', 'new_logo', 'draft',
          'The standard onboarding journey, migrated verbatim from the hardcoded lifecycle.',
          'Migrated from lifecycle.ts — stages only, no invented content.')
  returning id into tpl_id;

  insert into journey_template_stages
    (template_id, position, stage_key, name, phase, purpose, gate_mode)
  values
    (tpl_id, 1, 'handoff', 'Handoff', 'intake',
     'Sales-to-implementation transfer of context, promises and risks accepted by TIS.', 'advisory'),
    (tpl_id, 2, 'plan-internal', 'Plan Internally', 'delivery',
     'Internal implementation plan, owners and target dates committed.', 'advisory'),
    (tpl_id, 3, 'align-external', 'Align Externally', 'delivery',
     'Customer stakeholders, success criteria and decision rights agreed.', 'advisory'),
    (tpl_id, 4, 'build', 'Build', 'delivery',
     'Configuration, integrations and data migration executed.', 'advisory'),
    (tpl_id, 5, 'validate-iterate', 'Validate / Iterate', 'delivery',
     'UAT and iteration loops closed; readiness sign-off complete.', 'advisory'),
    -- Blocking because launch-gate.ts already enforces this server-side.
    (tpl_id, 6, 'launch', 'Launch', 'delivery',
     'Go-live executed and hypercare window opened.', 'blocking'),
    (tpl_id, 7, 'adopt', 'Adopt', 'value',
     'Usage breadth and depth at the agreed bar, with success criteria evidenced.', 'advisory'),
    (tpl_id, 8, 'graduate-to-cs', 'Handover to Customer Success', 'steady_state',
     'Ready to hand over confirmed and accepted by Customer Success.', 'advisory');

  perform publish_template(tpl_id, 'Migrated from lifecycle.ts', null);
end $$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Implementations whose current_stage does not normalise (pre-handoff values,
-- CSV junk) are SKIPPED and reported, never guessed at and never fatal. They
-- keep rendering on the legacy path exactly as they do today.
create table _backfill_0015_skipped (
  implementation_id uuid primary key,
  current_stage text,
  noted_at timestamptz not null default now()
);

do $$
declare
  tpl_id uuid;
  impl record;
  st record;
  cur_key text;
  cur_pos int;
  hist_min timestamptz;
  hist_max timestamptz;
  hist_count int;
  per_stage jsonb;
  done_count int := 0;
  skip_count int := 0;
begin
  select id into tpl_id from journey_templates
   where key = 'new-logo' and version = 1;

  for impl in select id, current_stage from implementations where journey_template_id is null loop
    -- Mirrors STAGE_ALIASES in lifecycle.ts.
    cur_key := case lower(replace(trim(impl.current_stage), '_', '-'))
      when 'plan' then 'plan-internal'
      when 'align' then 'align-external'
      when 'validate' then 'validate-iterate'
      when 'prove-value' then 'adopt'
      when 'graduate' then 'graduate-to-cs'
      when 'cs' then 'graduate-to-cs'
      else lower(replace(trim(impl.current_stage), '_', '-'))
    end;

    select position into cur_pos from journey_template_stages
     where template_id = tpl_id and stage_key = cur_key;

    if cur_pos is null then
      insert into _backfill_0015_skipped (implementation_id, current_stage)
      values (impl.id, impl.current_stage) on conflict do nothing;
      skip_count := skip_count + 1;
      raise notice 'backfill skipped % (current_stage=%): does not normalise',
        impl.id, impl.current_stage;
      continue;
    end if;

    per_stage := '[]'::jsonb;

    for st in select * from journey_template_stages
               where template_id = tpl_id order by position loop
      select min(entered_at), max(coalesce(exited_at, entered_at)), count(*)
        into hist_min, hist_max, hist_count
        from implementation_stage_history
       where implementation_id = impl.id
         and lower(replace(trim(stage), '_', '-')) in (
           st.stage_key,
           case st.stage_key
             when 'plan-internal' then 'plan'
             when 'align-external' then 'align'
             when 'validate-iterate' then 'validate'
             when 'adopt' then 'prove-value'
             when 'graduate-to-cs' then 'graduate'
             else st.stage_key
           end
         );

      insert into stage_instances (
        implementation_id, template_stage_id, stage_key, name, phase, position,
        gate_mode, entry_criteria, exit_criteria, target_duration_days,
        status, provenance, entered_at, exited_at
      )
      values (
        impl.id, st.id, st.stage_key, st.name, st.phase, st.position,
        st.gate_mode, st.entry_criteria, st.exit_criteria, st.target_duration_days,
        case
          when st.position < cur_pos then 'done'
          when st.position = cur_pos then 'active'
          else 'pending'
        end,
        -- Observed when history actually recorded it; inferred when the state
        -- comes only from stage ORDER. The UI and metrics both need to know.
        case when hist_count > 0 then 'backfill_observed' else 'backfill_inferred' end,
        hist_min,
        case when st.position < cur_pos then hist_max else null end
      );

      per_stage := per_stage || jsonb_build_object(
        'stage_key', st.stage_key,
        'derivation', case when hist_count > 0 then 'observed' else 'inferred' end,
        'history_row_count', hist_count
      );
    end loop;

    update implementations
       set journey_template_id = tpl_id, journey_type = 'new_logo', template_version = 1
     where id = impl.id;

    insert into journey_events (implementation_id, kind, detail)
    values (impl.id, 'backfilled', jsonb_build_object(
      'template_key', 'new-logo', 'version', 1,
      'normalised_stage', cur_key, 'raw_stage', impl.current_stage,
      'per_stage', per_stage
    ));

    done_count := done_count + 1;
  end loop;

  raise notice 'backfill complete: % implementations pinned, % skipped', done_count, skip_count;
end $$;
