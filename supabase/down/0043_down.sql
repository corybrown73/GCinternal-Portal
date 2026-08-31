-- Reverse of 0043.
--
-- v3 has to go, not just the column. `journey_templates_current_idx` allows
-- one current published version per key, and leaving v3 in place while an
-- earlier down re-points v2 as current puts two rows in that state — which is
-- exactly how the first attempt at this file failed the down→up cycle.
--
-- Refuses rather than orphans. If any project has already been instantiated
-- against v3, deleting it would leave those rows pointing at a template that
-- no longer exists, and a dangling plan is worse than a failed rollback that
-- tells you why. In that case, roll forward instead: publish a v4 that puts
-- the two gates back to advisory.
do $$
declare v_v3 uuid; v_pinned int;
begin
  select id into v_v3
    from journey_templates
   where key = 'new-logo' and version = 3 and status = 'published';
  if v_v3 is null then
    raise notice '0043 down: no new-logo v3 to remove';
  else
    select count(*) into v_pinned from journey_instantiations where template_id = v_v3;
    if v_pinned > 0 then
      raise exception
        '0043 down: % project(s) are pinned to new-logo v3. Publish a v4 reverting the gates instead of deleting the version they are running on.',
        v_pinned;
    end if;

    -- ORDER MATTERS. `journey_templates_current_idx` is unique on (org_id, key)
    -- WHERE status='published' AND superseded_by_id IS NULL. Clearing v2's
    -- pointer while v3 is still published puts two rows in that set and the
    -- index refuses it — which is how the second attempt at this file failed.
    -- So v3 leaves the index first, then v2 becomes current again, then v3 goes.
    update journey_templates set status = 'draft' where id = v_v3;
    update journey_templates set superseded_by_id = null, updated_at = now()
     where superseded_by_id = v_v3;
    delete from journey_template_tasks where template_id = v_v3;
    delete from journey_template_stages where template_id = v_v3;
    delete from journey_templates where id = v_v3;
    raise notice '0043 down: removed new-logo v3 and restored v2 as current';
  end if;
end $$;

drop index if exists stage_history_overrides_idx;
alter table implementation_stage_history drop column if exists advanced_with_gaps;
