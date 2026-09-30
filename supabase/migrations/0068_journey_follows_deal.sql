-- 0068: the implementation's journey follows the deal's stage (backfill).
--
-- The deal moved Closed Won → Pre-kickoff → Onboarding → Complete while the
-- journey sat wherever it was opened, so an Onboarding Complete deal still
-- had its implementation at "handoff". The app now clamps the journey into
-- the band each deal stage allows on every deal-stage change
-- (lib/journey-for-deal.ts); this brings the existing rows into that band.
--
-- Floors: closed_won / field_fusion_setup / onboarding_kickoff → handoff;
-- in_onboarding → plan-internal; onboarding_complete → graduate-to-cs.
-- Ceilings: the pre-kickoff stages → handoff; in_onboarding → adopt;
-- onboarding_complete → graduate-to-cs. Only rows outside the band move;
-- each move is a history row noting the backfill, and the stage_instances
-- mirror is resynced from current_stage.
do $$
declare
  r record;
  v_target text;
  v_at timestamptz := now();
begin
  for r in
    select i.id as impl_id, i.current_stage, a.stage as deal_stage
    from public.implementations i
    join public.portal_accounts a on a.id = i.deal_id
    where i.superseded_by_implementation_id is null
  loop
    v_target := null;
    if r.deal_stage in ('closed_won','field_fusion_setup','onboarding_kickoff') then
      if r.current_stage <> 'handoff' then v_target := 'handoff'; end if;
    elsif r.deal_stage = 'in_onboarding' then
      if r.current_stage = 'handoff' then v_target := 'plan-internal';
      elsif r.current_stage = 'graduate-to-cs' then v_target := 'adopt';
      end if;
    elsif r.deal_stage = 'onboarding_complete' then
      if r.current_stage <> 'graduate-to-cs' then v_target := 'graduate-to-cs'; end if;
    end if;

    if v_target is not null then
      update public.implementation_stage_history
         set exited_at = v_at
       where implementation_id = r.impl_id and exited_at is null;
      insert into public.implementation_stage_history (implementation_id, stage, entered_at, notes, exited_at)
      values (r.impl_id, v_target, v_at, 'Mirrored from the deal (backfill 0068)', null);
      update public.implementations
         set current_stage = v_target, stage_entered_at = v_at, updated_at = v_at
       where id = r.impl_id;
      perform public.resync_stage_instances(r.impl_id);
    end if;
  end loop;
end $$;
