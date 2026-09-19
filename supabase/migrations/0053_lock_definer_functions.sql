-- 0053: SECURITY DEFINER functions belong to the server, not the REST API.
--
-- Every function here runs with its owner's rights. PostgreSQL grants EXECUTE
-- to PUBLIC by default, and Supabase exposes every public-schema function at
-- /rest/v1/rpc, so a signed-in user — a customer-role login included — could
-- call sf_create_implementation directly and create an implementation the
-- app never asked for. The trigger functions cannot be called usefully (they
-- return `trigger`), but they are still listed by the linter and there is no
-- reason to leave the door open.
--
-- The app only ever reaches these through the service-role client, so
-- service_role keeps EXECUTE. Trigger firing does not check EXECUTE on the
-- trigger function, so the triggers keep working for every role.
--
-- The RLS helper functions (portal_is_internal, portal_is_admin,
-- portal_can_manage, portal_role, portal_is_super_admin) are deliberately NOT
-- touched: policies evaluate them as the calling role, which needs EXECUTE.
--
-- Also pins search_path on the seven functions the linter flagged as mutable,
-- so a caller cannot shadow a table name with their own schema.

do $$
declare
  fn text;
  trigger_fns text[] := array[
    'conversation_bump_activity', 'conversation_mention_enforce',
    'conversation_message_enforce', 'conversation_participant_enforce',
    'eag_enforce', 'portal_audit_observe_api_key',
    'portal_audit_observe_role_change', 'portal_lifecycle_stage_delete_guard',
    'portal_lifecycle_stage_guard', 'portal_lifecycle_stages_assert_builtins',
    'portal_link_team_member', 'project_conversation_enforce',
    'revoke_grants_for_contact', 'revoke_grants_for_implementation',
    'trace_link_sync_related', 'trace_link_sync_solution',
    'work_item_gate_from_template'
  ];
begin
  foreach fn in array trigger_fns loop
    if to_regprocedure(format('public.%I()', fn)) is not null then
      execute format('revoke execute on function public.%I() from public, anon, authenticated', fn);
      execute format('grant execute on function public.%I() to service_role', fn);
    end if;
  end loop;
end $$;

revoke execute on function public.sf_create_implementation(uuid, jsonb, uuid, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.sf_create_implementation(uuid, jsonb, uuid, text, text, timestamptz, uuid)
  to service_role;

revoke execute on function public.sf_supersede_implementation(uuid, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.sf_supersede_implementation(uuid, jsonb, text, uuid)
  to service_role;

alter function public.sf_id_18(text) set search_path = public;
alter function public.implementations_sf_identity_guard() set search_path = public;
alter function public.portal_pipeline_stage_key_immutable() set search_path = public;
alter function public.enforce_resolution_order() set search_path = public;
alter function public.enforce_completion_subject() set search_path = public;
alter function public.assign_completion_version() set search_path = public;
alter function public.freeze_completion_record() set search_path = public;
