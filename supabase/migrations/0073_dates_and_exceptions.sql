-- 0073: the dates the operating model measures by, how an implementation
-- ended, why a target moved, and what kind of note an exception is.
--
-- The model keeps three dates apart and never overwrites one with another:
-- the tier-expected Go-Live (set once at the close from the complexity
-- tier), the baseline (locked at "Plan and dates agreed"), and the current
-- target (follows the plan). Go-Live is the day TTV ends; Complete is
-- Proven or Not Proven. All of this already lived in the deal's intake
-- JSON; these columns make it reportable without parsing it.
alter table public.implementations
  add column if not exists tier_expected_date date,
  add column if not exists baseline_date date,
  add column if not exists baseline_locked_at timestamptz,
  add column if not exists target_date date,
  add column if not exists go_live_at date,
  add column if not exists complete_outcome text
    check (complete_outcome is null or complete_outcome in ('proven', 'not_proven')),
  add column if not exists complete_reason text;

comment on column public.implementations.tier_expected_date is
  'Go-Live the complexity tier expected, set once at the close. Never moved.';
comment on column public.implementations.baseline_date is
  'The target the day the plan was agreed (the baseline_locked tick). Never moved.';
comment on column public.implementations.target_date is
  'The plan''s current target; every move after the baseline needs a reason in target_date_changes.';
comment on column public.implementations.go_live_at is
  'Operational Go-Live: the day TTV ends.';

-- Backfill from what the deal already holds.
update public.implementations i
   set target_date = coalesce(i.target_date, i.target_launch_date)
 where i.target_date is null and i.target_launch_date is not null;

update public.implementations i
   set go_live_at = (a.intake->'timeline'->'completed'->>'go_live')::date
  from public.portal_accounts a
 where a.id = i.deal_id
   and i.go_live_at is null
   and (a.intake->'timeline'->'completed'->>'go_live') ~ '^\d{4}-\d{2}-\d{2}$';

update public.implementations i
   set baseline_date = coalesce(i.baseline_date, i.target_launch_date),
       baseline_locked_at = coalesce(
         i.baseline_locked_at,
         ((a.intake->'timeline'->'completed'->>'baseline_locked') || 'T12:00:00Z')::timestamptz
       )
  from public.portal_accounts a
 where a.id = i.deal_id
   and i.baseline_locked_at is null
   and (a.intake->'timeline'->'completed'->>'baseline_locked') ~ '^\d{4}-\d{2}-\d{2}$';

update public.implementations i
   set complete_outcome = a.intake->'outcome'->>'kind',
       complete_reason = a.intake->'outcome'->>'reason'
  from public.portal_accounts a
 where a.id = i.deal_id
   and i.complete_outcome is null
   and a.intake->'outcome'->>'kind' in ('proven', 'not_proven');

-- Every move of the target after the baseline, with its reason. The row is
-- written the moment the plan moves the date (reason null); a person then
-- explains it from the workspace. An unexplained move is visible, not lost.
create table if not exists public.target_date_changes (
  id uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references public.implementations (id) on delete cascade,
  from_date date,
  to_date date not null,
  reason_code text
    check (reason_code is null or reason_code in
      ('tier_mismatch', 'mis_scope', 'expansion', 'internal_delivery', 'customer', 'feasibility_outcome')),
  note text not null default '' check (length(note) <= 500),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  explained_by uuid,
  explained_at timestamptz
);
create index if not exists target_date_changes_impl_idx
  on public.target_date_changes (implementation_id, changed_at);

-- Service role only, like the parking lot (0063): the app reads and writes
-- through the service client.
alter table public.target_date_changes enable row level security;
revoke all on table public.target_date_changes from anon, authenticated;

-- An exception is a note of a kind: Scope, Customer or Internal delivery.
alter table public.journal_entries
  add column if not exists kind text not null default 'note'
    check (kind in ('note', 'scope', 'customer', 'internal_delivery'));

-- The complexity tiers, editable in Settings. Seeded from the integration
-- tiers as placeholders (business days to Go-Live = 15 + build weeks × 5)
-- until the real matrix is pasted in; an existing row is left alone.
insert into public.portal_app_config (key, value)
values ('complexity_tiers', jsonb_build_object('tiers', jsonb_build_array(
  jsonb_build_object('tier', 0, 'name', 'None', 'business_days', 15,
    'qualifies', 'No integration in scope.'),
  jsonb_build_object('tier', 1, 'name', 'Standard', 'business_days', 15,
    'qualifies', 'Free form build only. Nothing to connect.'),
  jsonb_build_object('tier', 2, 'name', 'Intermediate', 'business_days', 25,
    'qualifies', 'Level 1: PDF to Drive, OneDrive or Dropbox; form-to-form; calendar; text or email notifications.'),
  jsonb_build_object('tier', 3, 'name', 'Advanced', 'business_days', 30,
    'qualifies', 'Level 2: form-to-form loops, dispatch, QuickBooks Online, Salesforce, Slack, photo integration.'),
  jsonb_build_object('tier', 4, 'name', 'Complex', 'business_days', 35,
    'qualifies', 'Level 3: Workato-listed integrations, QuickBooks Desktop, Sage, self-serve integrations.'),
  jsonb_build_object('tier', 5, 'name', 'Unknown', 'business_days', 45,
    'qualifies', 'Level 4: not in Workato, API documentation approved by post-sales; Portal; a new integration.')
)))
on conflict (key) do nothing;
