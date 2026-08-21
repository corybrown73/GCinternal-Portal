-- Hardening pass from Supabase security advisors.

-- Pin search_path on the remaining trigger functions.
alter function portal_guard_stage_change() set search_path = public;
alter function portal_touch_updated_at() set search_path = public;

-- Trigger functions are invoked by triggers, never via RPC — remove the
-- default PUBLIC execute grant so /rest/v1/rpc can't reach them.
revoke execute on function portal_handle_new_user() from public, anon, authenticated;
revoke execute on function portal_guard_role_change() from public, anon, authenticated;

-- portal_is_admin backs RLS policies (authenticated needs EXECUTE); anon does not.
revoke execute on function portal_is_admin() from public, anon;

-- portal_transition_stage: signed-in users transition via RPC (the function
-- stamps auth.uid() as the actor); anon must never reach it — an anonymous
-- caller has no auth.uid() and would pass the actor-spoofing guard.
revoke execute on function portal_transition_stage(uuid, portal_account_stage, portal_transition_source, uuid, uuid, text, timestamptz) from public, anon;
