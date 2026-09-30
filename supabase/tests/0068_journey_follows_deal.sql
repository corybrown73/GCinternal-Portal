-- Probe for 0068: no implementation sits outside its deal's journey band.
do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from public.implementations i
  join public.portal_accounts a on a.id = i.deal_id
  where i.superseded_by_implementation_id is null
    and (
      (a.stage in ('closed_won','field_fusion_setup','onboarding_kickoff') and i.current_stage <> 'handoff')
      or (a.stage = 'in_onboarding' and i.current_stage in ('handoff','graduate-to-cs'))
      or (a.stage = 'onboarding_complete' and i.current_stage <> 'graduate-to-cs')
    );
  if v_bad > 0 then raise exception '0068: % implementation(s) outside the deal band', v_bad; end if;
  raise notice 'probe 0068 ok';
end $$;
