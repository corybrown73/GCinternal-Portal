-- Down for 0031_lifecycle_stages.sql
--
-- Drops the table and its three functions. Renamed labels, edited intents,
-- custom colours and any custom stage are lost; the app falls back to the
-- compiled-in LIFECYCLE_STAGES, which is exactly the pre-0031 behaviour.
--
-- Nothing about the projects themselves changes. `implementations.current_stage`
-- is a text column this migration never wrote to, and the stage history is
-- untouched — this table only ever described stages, it never held one.

-- The reorder RPC goes FIRST: it returns `setof portal_lifecycle_stages`, which
-- makes it depend on the table's composite type, so the table cannot be dropped
-- while it exists. The trigger functions can go either side but are kept here
-- for one obvious order.
drop function if exists portal_set_lifecycle_stage_order(text[], uuid);

drop table if exists portal_lifecycle_stages;

drop function if exists portal_lifecycle_stages_assert_builtins();
drop function if exists portal_lifecycle_stage_delete_guard();
drop function if exists portal_lifecycle_stage_guard();
