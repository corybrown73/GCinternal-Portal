-- Probe for 0065: a person cannot move a Prospect forward without a call
-- note and a SOW; a manager's 'force:' note may; an integration is not gated.
-- Seeds its own deal inside a transaction it rolls back.
begin;
insert into public.portal_accounts (id, name, stage)
values ('00000000-0000-4000-8000-000000000065', 'probe 0065', 'prospect');
do $$
declare v_row public.portal_stage_transitions;
begin
  begin
    v_row := public.portal_transition_stage('00000000-0000-4000-8000-000000000065', 'closed_won', 'ui');
    raise exception '0065: INVARIANT NOT ENFORCED - a bare Prospect moved to Closed Won by a person';
  exception when others then
    if sqlerrm not like 'closed_won_gate:%' then raise; end if;
    if sqlerrm not like '%notes%' or sqlerrm not like '%sow%' then
      raise exception '0065: the gate did not name both missing pieces: %', sqlerrm;
    end if;
  end;
  -- A manager's recorded decision passes.
  v_row := public.portal_transition_stage('00000000-0000-4000-8000-000000000065', 'closed_won', 'ui',
                                          null, null, 'force: probe');
  if v_row.to_stage <> 'closed_won' then raise exception '0065: force did not move the deal'; end if;
end $$;
rollback;

begin;
insert into public.portal_accounts (id, name, stage)
values ('00000000-0000-4000-8000-000000000065', 'probe 0065', 'prospect');
do $$
declare v_row public.portal_stage_transitions;
begin
  -- An integration delivering a Closed Won deal is not gated.
  v_row := public.portal_transition_stage('00000000-0000-4000-8000-000000000065', 'closed_won', 'api');
  if v_row.to_stage <> 'closed_won' then raise exception '0065: an api move was gated'; end if;
end $$;
rollback;

begin;
insert into public.portal_accounts (id, name, stage, sow_reference)
values ('00000000-0000-4000-8000-000000000065', 'probe 0065', 'prospect', 'SOW-1');
insert into public.portal_gong_reports (account_id, report_type, title, content_md)
values ('00000000-0000-4000-8000-000000000065', 'call_notes', 'probe', 'notes');
do $$
declare v_row public.portal_stage_transitions;
begin
  v_row := public.portal_transition_stage('00000000-0000-4000-8000-000000000065', 'closed_won', 'ui');
  if v_row.to_stage <> 'closed_won' then raise exception '0065: a ready deal was refused'; end if;
end $$;
rollback;
