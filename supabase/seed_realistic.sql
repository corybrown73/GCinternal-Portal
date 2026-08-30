-- Realistic demo data: the GoCanvas delivery team and eight live projects.
--
-- DESTRUCTIVE. Deletes every customer, project and deal, then rebuilds. Run it
-- deliberately; it is not a migration and is never applied automatically.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH:
--   * auth.users and portal_profiles — deleting those locks people out of the
--     app, which is a very expensive way to reset some demo accounts;
--   * journey_templates — New Logo v2 and its task list are the machinery these
--     projects run on, not data about them;
--   * portal_app_config — feature flags and the pipeline configuration.
--
-- WHY THE PROJECTS ARE BUILT FORWARD RATHER THAN INSERTED AT THEIR STAGE.
-- Every project starts at handoff, gets the full template, and is then WALKED
-- to its stage: each passed stage gets real entry and exit timestamps, its work
-- items are marked done, and a stage-history row is written. Inserting a
-- project directly at 'build' would produce exactly the hollow record this app
-- exists to avoid — a stage with no history behind it and no evidence anyone
-- did the work.

begin;

-- ---------------------------------------------------------------------------
-- 1. Clear the business data
-- ---------------------------------------------------------------------------
-- customers cascades to implementations, and implementations cascade to stage
-- instances, work items, commitments, risks, contacts, packets and the rest.
delete from account_files;
delete from portal_accounts;
delete from customers;

-- The seeded demo people from 0003. Real names replace them below; anyone
-- bridged to a login is left alone.
delete from team_members
 where id not in (select team_member_id from portal_profiles where team_member_id is not null);

-- ---------------------------------------------------------------------------
-- 2. The team
-- ---------------------------------------------------------------------------
-- Roles are free text in `team_members`, so these strings are what every owner
-- dropdown and report will show. They are the titles the business actually
-- uses, not a normalised vocabulary nobody asked for.
insert into team_members (id, name, role, email) values
  -- TIS — the technical account owner. Owns delivery, one per project.
  ('a0000000-0000-4000-8000-000000000001', 'Joy Jenkins',      'TIS', 'joy.jenkins@gocanvas.com'),
  ('a0000000-0000-4000-8000-000000000002', 'Teya Rampaul',     'TIS', 'teya.rampaul@gocanvas.com'),
  ('a0000000-0000-4000-8000-000000000003', 'Nikki Joy',        'TIS', 'nikki.joy@gocanvas.com'),
  ('a0000000-0000-4000-8000-000000000004', 'Saadiya Khan',     'TIS', 'saadiya.khan@gocanvas.com'),
  -- AE — closes new logo business.
  ('a0000000-0000-4000-8000-000000000005', 'Corey King',       'AE',  'corey.king@gocanvas.com'),
  ('a0000000-0000-4000-8000-000000000006', 'Mike Schmidt',     'AE',  'mike.schmidt@gocanvas.com'),
  -- Supporting roles.
  ('a0000000-0000-4000-8000-000000000007', 'Reid Mauer',       'TAM', 'reid.mauer@gocanvas.com'),
  ('a0000000-0000-4000-8000-000000000008', 'Tyler Paulovkin',  'SE',  'tyler.paulovkin@gocanvas.com'),
  -- AM — the commercial contact. One per customer, across every project.
  ('a0000000-0000-4000-8000-000000000009', 'John Foster',        'AM', 'john.foster@gocanvas.com'),
  ('a0000000-0000-4000-8000-00000000000a', 'Carrie Pennypacker', 'AM', 'carrie.pennypacker@gocanvas.com'),
  ('a0000000-0000-4000-8000-00000000000b', 'Corinne Stanley',    'AM', 'corinne.stanley@gocanvas.com'),
  ('a0000000-0000-4000-8000-00000000000c', 'Bryan Maxin',        'AM', 'bryan.maxin@gocanvas.com');

-- ---------------------------------------------------------------------------
-- 3. Walk a project forward to its stage
-- ---------------------------------------------------------------------------
-- Seed scaffolding, and DROPPED at the end of this file. A function that
-- fabricates stage history is exactly what you do not want left reachable from
-- a running system.
--
-- It is a normal function rather than a pg_temp one because some clients run
-- each statement in its own session, and a temp function would vanish between
-- the CREATE and the first call.
create or replace function seed_project(
  p_name           text,
  p_industry       text,
  p_arr            numeric,
  p_tier           text,
  p_tis            uuid,
  p_am             uuid,
  p_ae             text,
  p_target_stage   text,
  p_started_days   int,      -- how long ago the project began
  p_launch_days    int       -- target launch, relative to today
)
returns uuid
language plpgsql
as $fn$
declare
  v_cust    uuid;
  v_impl    uuid;
  v_tpl     uuid;
  v_target  int;
  st        record;
  v_start   timestamptz := now() - make_interval(days => p_started_days);
  v_cursor  timestamptz;
  v_span    int;
begin
  insert into customers (name, industry, arr, segment, account_manager_id)
    values (p_name, p_industry, p_arr,
            case when p_arr >= 70000 then 'Mid-Market' else 'SMB' end, p_am)
    returning id into v_cust;

  insert into implementations
    (customer_id, name, current_stage, stage_entered_at, status, source,
     owner_id, sales_owner, tier, target_launch_date, contract_start_date, sow_value,
     customer_goals)
  values
    (v_cust, p_name, 'handoff', v_start, 'on_track', 'presale',
     p_tis, p_ae, p_tier, (current_date + p_launch_days), v_start::date, p_arr,
     'Replace paper ' || lower(p_industry) || ' forms so crews submit from the field '
     || 'and the office stops re-keying them.')
    returning id into v_impl;

  insert into implementation_stage_history (implementation_id, stage, entered_at)
    values (v_impl, 'handoff', v_start);

  select id into v_tpl from journey_templates
   where key = 'new-logo' and status = 'published' and superseded_by_id is null;
  perform apply_journey_template(v_impl, v_tpl);

  select position into v_target from stage_instances
   where implementation_id = v_impl and stage_key = p_target_stage;

  -- Walk each passed stage: real dates, completed work, a history row. The
  -- elapsed time is split evenly across the stages behind the cursor, which is
  -- a fiction but a consistent one — every dwell metric reads a plausible span
  -- rather than eight stages all entered at the same instant.
  v_span := greatest(1, p_started_days / greatest(v_target, 1));
  v_cursor := v_start;

  for st in select * from stage_instances
             where implementation_id = v_impl and position < v_target
             order by position loop
    update stage_instances
       set status = 'done', entered_at = v_cursor, exited_at = v_cursor + make_interval(days => v_span)
     where id = st.id;

    -- Everything in a stage the project has left is done. These are seeded
    -- projects with a manufactured past; a real one gets no such treatment
    -- (see 0033, and D10).
    update work_items
       set status = 'done', completed_at = v_cursor + make_interval(days => v_span)
     where stage_instance_id = st.id;

    update implementation_stage_history
       set exited_at = v_cursor + make_interval(days => v_span)
     where implementation_id = v_impl and stage = st.stage_key and exited_at is null;

    v_cursor := v_cursor + make_interval(days => v_span);

    if st.position + 1 <= v_target then
      insert into implementation_stage_history (implementation_id, stage, entered_at)
      select v_impl, s2.stage_key, v_cursor
        from stage_instances s2
       where s2.implementation_id = v_impl and s2.position = st.position + 1
         and not exists (
           select 1 from implementation_stage_history h
            where h.implementation_id = v_impl and h.stage = s2.stage_key);
    end if;
  end loop;

  update stage_instances set status = 'active', entered_at = v_cursor, exited_at = null
   where implementation_id = v_impl and position = v_target;
  update stage_instances set status = 'pending', entered_at = null, exited_at = null
   where implementation_id = v_impl and position > v_target;

  update implementations
     set current_stage = p_target_stage, stage_entered_at = v_cursor
   where id = v_impl;

  return v_impl;
end $fn$;

-- ---------------------------------------------------------------------------
-- 4. Eight live projects, one per stage
-- ---------------------------------------------------------------------------
select seed_project('Cascade Roofing Group',      'Roofing',        32000, 'standard',
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000009', 'Corey King',
  'handoff',           4,  75);
select seed_project('Harbor Point Utilities',     'Utilities',      58000, 'strategic',
  'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'Mike Schmidt',
  'plan-internal',    12,  62);
select seed_project('Redstone Aggregates',        'Mining',         45000, 'standard',
  'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000b', 'Corey King',
  'align-external',   24,  48);
select seed_project('Vantage Facility Services',  'Facilities',     76000, 'strategic',
  'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-00000000000c', 'Mike Schmidt',
  'build',            38,  34);
select seed_project('Northbridge Mechanical',     'HVAC',           41000, 'standard',
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000009', 'Corey King',
  'validate-iterate', 52,  21);
select seed_project('Copperline Energy Services', 'Energy',         94000, 'strategic',
  'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'Mike Schmidt',
  'launch',           66,   9);
select seed_project('Sierra Pipeline Inspection', 'Pipeline',       63000, 'standard',
  'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000b', 'Corey King',
  'adopt',            84,  -6);
select seed_project('Fairview Environmental',     'Environmental',  52000, 'standard',
  'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-00000000000c', 'Mike Schmidt',
  'graduate-to-cs',  104, -28);

-- ---------------------------------------------------------------------------
-- 5. A pre-sale pipeline for the AEs
-- ---------------------------------------------------------------------------
-- `am_owner_id` and `se_owner_id` reference portal_profiles — people with a
-- LOGIN — and these AEs do not have one yet. Left null rather than pointed at a
-- team_members id, which would be a foreign key violation dressed up as data.
-- Invite them from /admin/users and the deal owner dropdowns will offer them.
insert into portal_accounts (name, stage, arr, domain, summary) values
  ('Ridgeline Excavation',   'prospect',   28000, 'ridgelineexc.com',
   'Corey King — 40 crews on paper dig tickets; wants photo capture and same-day invoicing.'),
  ('Atlas Crane & Rigging',  'prospect',   87000, 'atlascrane.com',
   'Mike Schmidt — lift plans and daily inspections across 6 yards. Competitive against incumbent.'),
  ('Delta Water Works',      'closed_won', 39000, 'deltawaterworks.com',
   'Corey King — signed, not yet handed off to delivery.'),
  ('Summit Line Construction','prospect',  51000, 'summitline.com',
   'Mike Schmidt — utility line crews, offline-heavy. Technical review booked.');

drop function if exists seed_project(
  text, text, numeric, text, uuid, uuid, text, text, int, int);

commit;
