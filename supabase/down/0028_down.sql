-- Down for 0028_pipeline_stages.sql
--
-- 0028 was additive: it created a config table and left the enum, the accounts
-- column, the stage history and portal_transition_stage exactly as it found
-- them. So this rollback cannot lose an account's stage or a transition row —
-- there is nothing here that ever owned them.
--
-- What it CAN lose is the configuration itself: labels somebody rewrote, an
-- order somebody chose, colours somebody picked, and which stage they declared
-- to be Closed Won. That is recorded human input, so it is archived to
-- v2_archive before the table goes.
--
-- After this runs the app falls back to its compiled-in defaults, which are
-- the enum in enum order — i.e. exactly the pre-0028 behaviour.

do $$
declare
  n int;
begin
  if to_regclass('public.portal_pipeline_stages') is null then
    raise notice 'portal_pipeline_stages already absent';
    return;
  end if;
  execute 'select count(*) from public.portal_pipeline_stages' into n;
  if n > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.pipeline_stages
             as table public.portal_pipeline_stages';
    raise notice 'archived % pipeline stage row(s) to v2_archive before dropping', n;
  end if;
end $$;

-- The RPC returns `setof portal_pipeline_stages` and the view selects from it,
-- so both go before the table. The table drop takes its own triggers with it.
drop function if exists portal_set_pipeline_stage_order(text[], uuid);
drop function if exists portal_set_pipeline_stage_mark(text, text, uuid);
drop view if exists portal_pipeline_stages_v;
drop table if exists portal_pipeline_stages;

drop function if exists portal_pipeline_stages_assert_marks();
drop function if exists portal_pipeline_stage_delete_guard();
drop function if exists portal_pipeline_stage_key_immutable();
drop function if exists portal_stage_key_enterable(text);

-- portal_transition_stage, portal_account_stage, portal_accounts.stage and
-- portal_stage_transitions are deliberately untouched here, because 0028 did
-- not touch them either.

update portal_app_config
   set value = value - 'presale_stage_config'
 where key = 'v2_flags';
