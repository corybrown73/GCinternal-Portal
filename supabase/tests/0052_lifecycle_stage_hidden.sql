-- Invariant probes for hidden lifecycle stages (0052).
begin;

-- Default: nothing hidden.
do $$
begin
  if exists (select 1 from portal_lifecycle_stages where hidden) then
    raise exception 'INVARIANT: a stage is hidden by default';
  end if;
  raise notice 'ok — no stage hidden by default';
end $$;

-- A built-in stage can be hidden and shown again; the guard that protects
-- key and is_builtin does not object.
update portal_lifecycle_stages set hidden = true where key = 'adopt';
do $$
begin
  if not exists (select 1 from portal_lifecycle_stages where key = 'adopt' and hidden) then
    raise exception 'INVARIANT: hiding a built-in stage did not stick';
  end if;
  raise notice 'ok — built-in stage hidden';
end $$;
update portal_lifecycle_stages set hidden = false where key = 'adopt';

rollback;
