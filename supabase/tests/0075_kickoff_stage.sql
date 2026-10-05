-- Probe for 0074/0075: the enum has the Kickoff value, the configured
-- pipeline has the Kickoff row right after Pre-Kickoff and before Get it
-- working, and re-running 0075's seed is a no-op.
do $$
declare v_pk int; v_k int; v_g int; v_n int;
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'portal_account_stage' and e.enumlabel = 'kickoff'
  ) then raise exception '0074: enum value kickoff is missing'; end if;
  select sort_order into v_pk from public.portal_pipeline_stages where key = 'onboarding_kickoff';
  select sort_order into v_k  from public.portal_pipeline_stages where key = 'kickoff';
  select sort_order into v_g  from public.portal_pipeline_stages where key = 'get_it_working';
  if v_k is null then raise exception '0075: no kickoff row'; end if;
  if v_k <> v_pk + 1 or v_g <> v_k + 1 then
    raise exception '0075: kickoff is not between Pre-Kickoff and Get it working (% % %)', v_pk, v_k, v_g;
  end if;
  select count(*) into v_n from public.portal_pipeline_stages where key = 'kickoff';
  if v_n <> 1 then raise exception '0075: % kickoff rows', v_n; end if;
  raise notice 'probe 0075 ok';
end $$;
