-- Probe for 0062: the function exists and anon/authenticated cannot run it.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'portal_merge_intake') then
    raise exception '0062: portal_merge_intake missing';
  end if;
  if has_function_privilege('anon', 'public.portal_merge_intake(uuid, jsonb, jsonb)', 'execute') then
    raise exception '0062: anon can execute portal_merge_intake';
  end if;
  if has_function_privilege('authenticated', 'public.portal_merge_intake(uuid, jsonb, jsonb)', 'execute') then
    raise exception '0062: authenticated can execute portal_merge_intake';
  end if;
end $$;
