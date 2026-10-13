-- 0086: a moved milestone date always lands, even on a deal whose plan has no
-- saved overrides yet.
--
-- portal_record_milestone_date_change (0082) wrote the new date with
-- jsonb_set(intake, '{timeline,overrides,<key>}', ...). jsonb_set creates only
-- the last key of a path, so on a deal whose intake had no timeline, or a
-- timeline with no overrides object, the date did not move — while the
-- history rows were written and Adjust plan dates reported the move as saved.
-- Four closed deals were in that state when this shipped. The function now
-- makes sure timeline and timeline.overrides are objects first. Nothing else
-- about it changes.
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
                    jsonb_set(
                      jsonb_set(
                        coalesce(intake, '{}'::jsonb),
                        '{timeline}',
                        case when jsonb_typeof(intake -> 'timeline') = 'object'
                             then intake -> 'timeline' else '{}'::jsonb end,
                        true
                      ),
                      '{timeline,overrides}',
                      case when jsonb_typeof(intake #> '{timeline,overrides}') = 'object'
                           then intake #> '{timeline,overrides}' else '{}'::jsonb end,
                      true
                    ),
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
