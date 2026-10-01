-- Probe for 0070: Negotiate & Finalize sits right after Prospect; a person
-- cannot move a Negotiate deal to Closed Won without a call note and a SOW;
-- Prospect → Negotiate is not gated; 'force:' and integrations pass.
-- Seeds its own deal inside a transaction it rolls back.
begin;
do $$
declare v_pos int; v_prospect int;
begin
  select sort_order into v_prospect from public.portal_pipeline_stages where key = 'prospect';
  select sort_order into v_pos from public.portal_pipeline_stages where key = 'negotiate';
  if v_pos is null then raise exception '0070: no negotiate row'; end if;
  if v_pos <> v_prospect + 1 then raise exception '0070: negotiate is not right after prospect'; end if;
  raise notice 'probe 0070 order ok';
end $$;
insert into public.portal_accounts (id, name, stage)
values ('00000000-0000-4000-8000-000000000070', 'probe 0070', 'prospect');
do $$
declare v_row public.portal_stage_transitions;
begin
  -- Prospect → Negotiate is not gated.
  v_row := public.portal_transition_stage('00000000-0000-4000-8000-000000000070', 'negotiate', 'ui');
  if v_row.to_stage <> 'negotiate' then raise exception '0070: prospect → negotiate was gated'; end if;
  begin
    v_row := public.portal_transition_stage('00000000-0000-4000-8000-000000000070', 'closed_won', 'ui');
    raise exception '0070: INVARIANT NOT ENFORCED - a bare Negotiate deal moved to Closed Won by a person';
  exception when others then
    if sqlerrm not like 'closed_won_gate:%' then raise; end if;
    if sqlerrm not like '%notes%' or sqlerrm not like '%sow%' then
      raise exception '0070: the gate did not name both missing pieces: %', sqlerrm;
    end if;
  end;
  v_row := public.portal_transition_stage('00000000-0000-4000-8000-000000000070', 'closed_won', 'ui',
                                          null, null, 'force: probe');
  if v_row.to_stage <> 'closed_won' then raise exception '0070: force did not move the deal'; end if;
  raise notice 'probe 0070 gate ok';
end $$;
rollback;

begin;
insert into public.portal_accounts (id, name, stage)
values ('00000000-0000-4000-8000-000000000070', 'probe 0070', 'negotiate');
do $$
declare v_row public.portal_stage_transitions;
begin
  v_row := public.portal_transition_stage('00000000-0000-4000-8000-000000000070', 'closed_won', 'api');
  if v_row.to_stage <> 'closed_won' then raise exception '0070: an api move was gated'; end if;
  raise notice 'probe 0070 api ok';
end $$;
rollback;
