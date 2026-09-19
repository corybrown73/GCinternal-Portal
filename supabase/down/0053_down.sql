-- Restores the default EXECUTE grant (PUBLIC) and clears the pinned search_path.
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
      execute format('grant execute on function public.%I() to public', fn);
    end if;
  end loop;
end $$;
grant execute on function public.sf_create_implementation(uuid, jsonb, uuid, text, text, timestamptz, uuid) to public;
grant execute on function public.sf_supersede_implementation(uuid, jsonb, text, uuid) to public;
alter function public.sf_id_18(text) reset search_path;
alter function public.implementations_sf_identity_guard() reset search_path;
alter function public.portal_pipeline_stage_key_immutable() reset search_path;
alter function public.enforce_resolution_order() reset search_path;
alter function public.enforce_completion_subject() reset search_path;
alter function public.assign_completion_version() reset search_path;
alter function public.freeze_completion_record() reset search_path;
