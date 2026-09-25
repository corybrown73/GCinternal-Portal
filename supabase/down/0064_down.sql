-- Reverses 0064: the observe trigger back to its 0025 body, and the two
-- handoff scopes removed from the keys 0064 granted them to — but only where
-- nobody has edited that key's scopes since, because a scope an operator set
-- by hand is a decision a rollback must not undo. Every audit row stays: an
-- audit row is the record, and this writes one more saying what it took back.

create or replace function public.portal_audit_observe_api_key()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'api_key.create.observed', 'api_key', new.id,
            jsonb_build_object('source', 'trigger', 'name', new.name,
                               'key_prefix', new.key_prefix, 'scopes', to_jsonb(new.scopes)));
  elsif new.revoked_at is distinct from old.revoked_at and new.revoked_at is not null then
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'api_key.revoke.observed', 'api_key', new.id,
            jsonb_build_object('source', 'trigger', 'name', new.name,
                               'key_prefix', new.key_prefix));
  end if;
  return new;
end $$;
revoke execute on function public.portal_audit_observe_api_key() from public, anon, authenticated;
grant execute on function public.portal_audit_observe_api_key() to service_role;

with reversed as (
  update public.portal_api_keys k
     set scopes = array_remove(array_remove(k.scopes, 'handoff:read'), 'handoff:write')
   where k.revoked_at is null
     and exists (select 1 from public.portal_audit_log a
                  where a.entity_id = k.id and a.action = 'api_key.scopes_backfill')
     and not exists (select 1 from public.portal_audit_log a
                      where a.entity_id = k.id and a.action = 'api_key.scopes_update')
  returning k.id, k.name, k.key_prefix, k.scopes
)
insert into public.portal_audit_log (actor_type, action, entity_type, entity_id, payload)
select 'system', 'api_key.scopes_backfill_reversed', 'api_key', id,
       jsonb_build_object('source', 'down 0064', 'name', name, 'key_prefix', key_prefix,
                          'removed', jsonb_build_array('handoff:read', 'handoff:write'),
                          'scopes', to_jsonb(scopes))
  from reversed;
