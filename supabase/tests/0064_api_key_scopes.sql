-- Probe for 0064: no select-all key is left without the handoff scopes, a
-- scopes change is recorded by the observe trigger, and only the service
-- role may run it. CI's database has no keys, so the second part seeds its
-- own inside a transaction it rolls back.
do $$
begin
  if exists (
    select 1 from public.portal_api_keys
     where revoked_at is null
       and scopes @> array['accounts:read', 'accounts:write', 'transitions:write', 'tam:write',
                           'tickets:write', 'alerts:write',
                           'implementations:read', 'implementations:write']
       and not (scopes @> array['handoff:read', 'handoff:write'])
  ) then
    raise exception '0064: a select-all key still lacks handoff:read/handoff:write';
  end if;
  if has_function_privilege('anon', 'public.portal_audit_observe_api_key()', 'execute') then
    raise exception '0064: anon can execute portal_audit_observe_api_key';
  end if;
  if has_function_privilege('authenticated', 'public.portal_audit_observe_api_key()', 'execute') then
    raise exception '0064: authenticated can execute portal_audit_observe_api_key';
  end if;
end $$;

begin;
insert into public.portal_api_keys (id, name, key_prefix, key_hash, scopes)
values ('00000000-0000-4000-8000-000000000064', 'probe 0064', 'gcp_live_pro',
        repeat('0', 64), array['accounts:read']);
update public.portal_api_keys
   set scopes = array['accounts:read', 'handoff:read']
 where id = '00000000-0000-4000-8000-000000000064';
do $$
begin
  if not exists (
    select 1 from public.portal_audit_log
     where entity_id = '00000000-0000-4000-8000-000000000064'
       and action = 'api_key.scopes_update.observed'
       and payload -> 'to' ? 'handoff:read'
       and not (payload -> 'from' ? 'handoff:read')
  ) then
    raise exception '0064: INVARIANT NOT ENFORCED - a scopes change wrote no observed row';
  end if;
  update public.portal_api_keys set last_used_at = now()
   where id = '00000000-0000-4000-8000-000000000064';
  if (select count(*) from public.portal_audit_log
       where entity_id = '00000000-0000-4000-8000-000000000064'
         and action = 'api_key.scopes_update.observed') <> 1 then
    raise exception '0064: a last_used_at stamp was recorded as a scopes change';
  end if;
end $$;
rollback;
