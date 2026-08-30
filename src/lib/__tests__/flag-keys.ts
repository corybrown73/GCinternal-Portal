/**
 * The flag keys, duplicated for the test.
 *
 * `app-config.server.ts` imports the service-role Supabase client at module
 * load, which a unit test has no business constructing. The catalogue test
 * needs the KEY SET and nothing else, so it lives here — and the test asserts
 * in both directions, so this list drifting from the real one fails loudly
 * rather than quietly weakening the check.
 */
export const DEFAULT_FLAGS_FOR_TEST = {
  account_model: false,
  journey_templates: false,
  work_items: false,
  handoff_gate: false,
  external_plan_view_enabled: false,
  external_plan_actions_enabled: false,
  sf_auto_create: false,
  sf_presale_bridge: false,
  signals_alerts: false,
  audit_activity_feed: false,
  audit_strict: false,
  handover_record: false,
  trace_links_editing: false,
  global_search: false,
  saved_views: false,
  demo_mode: false,
  api_key_limits: false,
  presale_stage_config: false,
  conversations: false,
  lifecycle_stage_config: false,
} as const;
