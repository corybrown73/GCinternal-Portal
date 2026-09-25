-- 0064: the connector's key gets its handoff scopes, and scope changes go on the record.
--
-- Admin → API keys offered eight scopes when the MCP connector's key was
-- minted on 2026-09-01: the form's client-side copy of API_SCOPES never
-- learned handoff:read and handoff:write, so a key made there could not
-- carry them and every MCP tool call has been refused with missing_scope.
--
-- Two changes. (A) An unrevoked key that already holds every one of those
-- eight scopes was a "select all" full-trust key made before the two could be
-- picked; it gets both, and the grant is written to portal_audit_log as a
-- system row naming this migration. A key holding fewer (the Google Sheet
-- key: accounts:write only) is left exactly as its operator chose.
-- (B) Scopes become editable from the admin page, so the observe trigger
-- from 0025 learns to record a scopes change the way it records create and
-- revoke. (A) runs before (B) so the backfill is recorded once, by its own
-- row, and not also as an unattributed '.observed' row.

-- A. Backfill. A key holding one of the two already gets only the other, and
-- the audit row names exactly what was added.
with candidates as (
  select k.id, k.scopes as before_scopes
    from public.portal_api_keys k
   where k.revoked_at is null
     and k.scopes @> array['accounts:read', 'accounts:write', 'transitions:write', 'tam:write',
                           'tickets:write', 'alerts:write',
                           'implementations:read', 'implementations:write']
     and not (k.scopes @> array['handoff:read', 'handoff:write'])
),
granted as (
  update public.portal_api_keys k
     set scopes = k.scopes || (
       select coalesce(array_agg(s), '{}'::text[])
         from unnest(array['handoff:read', 'handoff:write']) as s
        where not (s = any (k.scopes))
     )
    from candidates c
   where k.id = c.id
  returning k.id, k.name, k.key_prefix, k.scopes, c.before_scopes
)
insert into public.portal_audit_log (actor_type, action, entity_type, entity_id, payload)
select 'system', 'api_key.scopes_backfill', 'api_key', id,
       jsonb_build_object('source', 'migration 0064', 'name', name, 'key_prefix', key_prefix,
                          'added', to_jsonb(array(select s from unnest(scopes) as s
                                                   where not (s = any (before_scopes)))),
                          'scopes', to_jsonb(scopes))
  from granted;

-- B. The observe trigger records a scopes change.
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
  elsif new.scopes is distinct from old.scopes then
    insert into portal_audit_log (actor_type, action, entity_type, entity_id, payload)
    values ('system', 'api_key.scopes_update.observed', 'api_key', new.id,
            jsonb_build_object('source', 'trigger', 'name', new.name,
                               'key_prefix', new.key_prefix,
                               'from', to_jsonb(old.scopes), 'to', to_jsonb(new.scopes)));
  end if;
  return new;
end $$;

-- 0053's lock, re-asserted: create or replace keeps privileges, but the
-- invariant belongs in the file that redefines the function.
revoke execute on function public.portal_audit_observe_api_key() from public, anon, authenticated;
grant execute on function public.portal_audit_observe_api_key() to service_role;
