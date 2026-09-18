-- 0052 — a lifecycle stage can be hidden.
--
-- WHY. The eight built-in stages are named by application code (the launch
-- gate, the handoff gate, the CS handover) and so cannot be deleted. A team
-- whose journey has six stages still needs six on screen. Hidden means: not
-- on the rail, not in the journey, not offered as the next stage — while the
-- key keeps working for history, for gates and for any project that is
-- already sitting in it.
alter table portal_lifecycle_stages
  add column if not exists hidden boolean not null default false;

comment on column portal_lifecycle_stages.hidden is
  'Not shown on the rail or offered as a next stage. The key stays valid for history and the gates that name it.';
