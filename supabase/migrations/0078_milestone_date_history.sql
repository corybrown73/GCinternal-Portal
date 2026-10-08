-- 0078: an auditable history of account-specific milestone date changes.
--
-- intake.timeline.overrides has only ever held the LATEST date a person set
-- for a milestone key — moving it again threw the previous value away, with
-- no reason, no actor, and no way to tell a date a person moved by hand from
-- one that only followed because an earlier date cascaded. This adds that
-- history beside the override, not instead of it: the override in the
-- intake JSON stays the single source for "what date is it today" (every
-- scheduling calculation keeps reading it exactly as before); these tables
-- are the append-only record of how it got there.
--
-- portal_milestone_date_baselines holds the FIRST effective date on record
-- for a milestone key, written once, the moment its first explicit change is
-- recorded — never updated after. An account whose overrides predate this
-- migration has no row here: that original commitment is unknown, and this
-- migration does not invent one by backfilling a baseline from a date that
-- was never actually the first agreed date.
--
-- portal_milestone_date_changes is the append-only log: one 'direct' row
-- for the change a person made, with their required reason, and zero or
-- more 'cascade' rows for the later milestones that moved only because the
-- direct one did — each pointing back at it, never carrying a reason of its
-- own, because nobody edited those by hand.
create table public.portal_milestone_date_baselines (
  account_id uuid not null references public.portal_accounts (id) on delete cascade,
  milestone_key text not null,
  baseline_date date not null,
  recorded_at timestamptz not null default now(),
  primary key (account_id, milestone_key)
);

create table public.portal_milestone_date_changes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.portal_accounts (id) on delete cascade,
  milestone_key text not null,
  change_kind text not null check (change_kind in ('direct', 'cascade')),
  previous_date date not null,
  new_date date not null,
  reason text,
  actor_id uuid,
  was_overdue_at_change boolean not null default false,
  caused_by_change_id uuid references public.portal_milestone_date_changes (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- A direct change is a human edit: it carries its own non-empty reason
  -- and points at nothing. A cascade carries no reason of its own — it is
  -- not a human edit — and must point back at the direct change that moved
  -- it, so it is always traceable and never free-floating.
  check (
    (change_kind = 'direct' and caused_by_change_id is null
      and reason is not null and length(btrim(reason)) > 0)
    or
    (change_kind = 'cascade' and caused_by_change_id is not null)
  )
);
create index portal_milestone_date_changes_account_idx
  on public.portal_milestone_date_changes (account_id, milestone_key, created_at);
create index portal_milestone_date_changes_caused_by_idx
  on public.portal_milestone_date_changes (caused_by_change_id);

-- Service role only, like the parking lot (0063) and target_date_changes
-- (0073): the app reads and writes through the service client.
alter table public.portal_milestone_date_baselines enable row level security;
revoke all on table public.portal_milestone_date_baselines from anon, authenticated;
alter table public.portal_milestone_date_changes enable row level security;
revoke all on table public.portal_milestone_date_changes from anon, authenticated;

-- The one write path: the override and its history land together, so a
-- reader can never see one without the other. A blank reason is refused
-- here too, not only by the app that calls this — the same belt-and-braces
-- the merge-intake function (0062) and the API-key consume function take.
--
-- p_cascades is a JSON array of {milestoneKey, previousDate, newDate,
-- wasOverdue}: the cascade DIFF is computed in the app from the same pure
-- scheduling function every screen uses (buildTimeline) — this function
-- does not reimplement or re-derive the plan's cascade math, it only
-- records what the app already computed, atomically with the override.
create or replace function public.portal_record_milestone_date_change(
  p_account uuid,
  p_milestone_key text,
  p_previous_date date,
  p_new_date date,
  p_reason text,
  p_actor uuid,
  p_was_overdue boolean,
  p_cascades jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change_id uuid;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required to change the date of milestone "%"', p_milestone_key;
  end if;

  update public.portal_accounts
     set intake = jsonb_set(
                    coalesce(intake, '{}'::jsonb),
                    array['timeline', 'overrides', p_milestone_key],
                    to_jsonb(p_new_date::text),
                    true
                  ),
         updated_at = now()
   where id = p_account;
  if not found then
    raise exception 'Deal % not found', p_account;
  end if;

  -- Write-once: the first call for this milestone key sets the baseline,
  -- every later one leaves it exactly as it was.
  insert into public.portal_milestone_date_baselines (account_id, milestone_key, baseline_date)
  values (p_account, p_milestone_key, p_previous_date)
  on conflict (account_id, milestone_key) do nothing;

  insert into public.portal_milestone_date_changes (
    account_id, milestone_key, change_kind, previous_date, new_date,
    reason, actor_id, was_overdue_at_change
  ) values (
    p_account, p_milestone_key, 'direct', p_previous_date, p_new_date,
    btrim(p_reason), p_actor, coalesce(p_was_overdue, false)
  )
  returning id into v_change_id;

  insert into public.portal_milestone_date_changes (
    account_id, milestone_key, change_kind, previous_date, new_date,
    reason, actor_id, was_overdue_at_change, caused_by_change_id
  )
  select
    p_account,
    c ->> 'milestoneKey',
    'cascade',
    (c ->> 'previousDate')::date,
    (c ->> 'newDate')::date,
    null,
    p_actor,
    coalesce((c ->> 'wasOverdue')::boolean, false),
    v_change_id
  from jsonb_array_elements(coalesce(p_cascades, '[]'::jsonb)) as c;

  return v_change_id;
end;
$$;

revoke all on function public.portal_record_milestone_date_change(
  uuid, text, date, date, text, uuid, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.portal_record_milestone_date_change(
  uuid, text, date, date, text, uuid, boolean, jsonb
) to service_role;
