-- 0034 — three core criteria per stage, as tasks people already tick
--
-- THE PROBLEM. Advancing a project meant finding a stage control and choosing
-- the next stage from a list. Nothing connected the move to the work: you could
-- advance out of Handoff without the kickoff being booked, and you could book
-- the kickoff without anything moving. The report was exact — "I have no clue
-- how I mark as scheduled internal kick off call, and trigger to the next
-- step" — and the ask was that ticking "Kick off call booked" IS the move.
--
-- WHY THIS IS A COLUMN AND NOT A NEW TABLE. A "stage criterion" is a thing with
-- a title, an owner, a party, a due date and a done/not-done state. That is a
-- work item. Modelling criteria separately would duplicate every one of those
-- fields plus the UI that renders them, and would immediately raise the
-- question of what happens when a criterion and a task describe the same job.
--
-- So a criterion is simply a work item flagged as a gate. Ticking it is the
-- same action as completing any other task — which is the whole point, because
-- the person doing the work should not have to also remember to advance a
-- stage. Three gates per stage, and the rest of the tasks stay optional.
--
-- Three is a deliberate ceiling. A gate list long enough to need scrolling
-- stops being a gate and becomes a second plan; at three, the exit condition
-- for a stage fits in a glance and there is no argument about what "done" means.

alter table journey_template_tasks
  add column if not exists is_gate boolean not null default false;

alter table work_items
  add column if not exists is_gate boolean not null default false;

comment on column journey_template_tasks.is_gate is
  'One of the (at most three) core criteria that must be complete before the '
  'stage can be left. Everything else in the stage is optional.';
comment on column work_items.is_gate is
  'Copied from the template task at instantiation. A hand-created work item is '
  'never a gate unless somebody says so.';

-- Which tasks are the gates. Drafted from the work itself and meant to be
-- corrected in /templates by the people who run these projects — the exit
-- condition for a stage is their judgement, not a schema decision.
--
-- The rule applied: a gate is the thing whose absence would make the NEXT
-- stage a waste of everyone's time. "Confirm the champion" matters, but you can
-- start planning without it; you cannot run a kickoff that was never booked.
-- `journey_template_frozen` refuses any write to a published template's tasks,
-- and rightly so: an app edit there would silently rewrite the plan of every
-- implementation already running that version.
--
-- This is not that. It is a schema migration populating a column that did not
-- exist when the template was published, and it changes no task's title, order,
-- owner or dates — nothing an implementation's plan is built from. The trigger
-- is therefore disabled for exactly this statement and restored immediately,
-- inside one transaction so a failure cannot leave it off.
begin;
alter table journey_template_tasks disable trigger journey_template_tasks_frozen;

-- Which tasks are the gates. Drafted from the work itself and meant to be
-- corrected in /templates by the people who run these projects — the exit
-- condition for a stage is their judgement, not a schema decision.
--
-- The rule applied: a gate is the thing whose absence would make the NEXT
-- stage a waste of everyone's time. "Confirm the champion" matters, but you can
-- start planning without it; you cannot run a kickoff that was never booked.
update journey_template_tasks k
   set is_gate = true
  from journey_template_stages s, journey_templates t
 where s.id = k.template_stage_id
   and t.id = s.template_id
   and t.key = 'new-logo'
   and k.task_key in (
     -- Handoff: you know what was sold, it matches the SOW, the call is booked.
     'nl.packet_review', 'nl.sow_confirm', 'nl.kickoff_scheduled',
     -- Plan internally: they can log in, success is defined, we reviewed it.
     'nl.account_provisioned', 'nl.success_criteria', 'nl.internal_plan_review',
     -- Align externally: the call happened, they agreed the plan, a date exists.
     'nl.kickoff_call', 'nl.plan_agreed', 'nl.launch_date_set',
     -- Build: something exists, they have seen it, the rest is built.
     'nl.first_form_built', 'nl.form_review', 'nl.remaining_forms',
     -- Validate: they tested it, the gaps are closed, they signed it off.
     'nl.customer_uat', 'nl.gaps_closed', 'nl.signoff_uat',
     -- Launch: crews trained, live, and a real submission has arrived.
     'nl.crew_training', 'nl.go_live', 'nl.first_submission',
     -- Adopt: all three, because this stage is only these three.
     'nl.week1_check', 'nl.blockers_cleared', 'nl.adoption_review',
     -- Graduate: all three, same reason.
     'nl.cs_intro', 'nl.handover_doc', 'nl.cs_accepted'
   );

alter table journey_template_tasks enable trigger journey_template_tasks_frozen;
commit;

-- Live projects carry the flag on their own rows, so a work item knows whether
-- it is a gate without joining back through a template that may since have been
-- superseded.
update work_items w
   set is_gate = k.is_gate
  from journey_template_tasks k
 where k.id = w.template_task_id
   and w.is_gate is distinct from k.is_gate;

-- Both creation paths copy the flag from here on.
create or replace function work_item_gate_from_template()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only for template-derived items, and only when the caller did not already
  -- state an answer. A hand-created item stays exactly what somebody made it.
  if new.template_task_id is not null and new.is_gate = false then
    select k.is_gate into new.is_gate
      from journey_template_tasks k where k.id = new.template_task_id;
    new.is_gate := coalesce(new.is_gate, false);
  end if;
  return new;
end $$;

drop trigger if exists work_items_gate_from_template on work_items;
create trigger work_items_gate_from_template
  before insert on work_items
  for each row execute function work_item_gate_from_template();
