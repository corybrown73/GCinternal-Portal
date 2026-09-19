-- Invariant probes for 0053: definer functions are server-only.
begin;

do $$
begin
  if has_function_privilege('authenticated',
       'public.sf_create_implementation(uuid, jsonb, uuid, text, text, timestamptz, uuid)', 'EXECUTE') then
    raise exception 'INVARIANT: authenticated can still execute sf_create_implementation';
  end if;
  if has_function_privilege('anon', 'public.eag_enforce()', 'EXECUTE') then
    raise exception 'INVARIANT: anon can still execute a definer trigger function';
  end if;
  if not has_function_privilege('service_role',
       'public.sf_create_implementation(uuid, jsonb, uuid, text, text, timestamptz, uuid)', 'EXECUTE') then
    raise exception 'INVARIANT: service_role lost execute on sf_create_implementation';
  end if;
  -- The RLS helpers must stay callable by the roles whose policies use them.
  if not has_function_privilege('authenticated', 'public.portal_is_internal()', 'EXECUTE') then
    raise exception 'INVARIANT: authenticated lost execute on portal_is_internal';
  end if;
  raise notice 'ok — definer functions are server-only, RLS helpers untouched';
end $$;

-- A trigger still fires for a role that cannot execute its function.
set local role authenticated;
do $$
begin
  perform 1;
end $$;
reset role;

rollback;
