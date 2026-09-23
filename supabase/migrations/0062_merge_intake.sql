-- 0062: merge into a deal's intake in one statement.
--
-- The AI steps (the brief's prefill, the SOW's facts, the help articles, the
-- reading's own status) each ran for a minute between reading the intake
-- and writing it back whole — anything a person typed in that minute, or a
-- second AI step finishing first, was silently lost. This merges only the
-- keys a step changed, inside one UPDATE, so nothing is read stale.
--
-- p_patch is merged at the top level; p_timeline, when given, is merged
-- into intake.timeline. Service role only: the app's server calls it.

create or replace function public.portal_merge_intake(
  p_account uuid,
  p_patch jsonb,
  p_timeline jsonb default null
) returns jsonb
language sql
security definer
set search_path = public
as $$
  update public.portal_accounts
     set intake = (coalesce(intake, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb))
                  || case
                       when p_timeline is null then '{}'::jsonb
                       else jsonb_build_object(
                         'timeline',
                         coalesce(intake -> 'timeline', '{}'::jsonb) || p_timeline
                       )
                     end,
         updated_at = now()
   where id = p_account
  returning intake;
$$;

revoke all on function public.portal_merge_intake(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.portal_merge_intake(uuid, jsonb, jsonb) to service_role;
