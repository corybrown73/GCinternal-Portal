-- Invariant probes for the form library and the intake column (0047).
--
-- Runs inside one transaction and rolls back. Requires ON_ERROR_STOP=1.
-- Every probe has a negative control: the thing that must be refused, and
-- the neighbouring thing that must be allowed, so a probe that passes
-- because the whole table is broken is caught by its partner.

begin;

create function pg_temp.assert_refused(p_sql text, p_fragment text, p_what text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'INVARIANT "%" was refused, but for the wrong reason. Expected "%", got: %',
        p_what, p_fragment, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT NOT ENFORCED: % was allowed', p_what;
end $fn$;

-- A card with no name cannot be found; nor one with no industry.
select pg_temp.assert_refused(
  $q$insert into form_templates (name, industry) values ('   ', 'Construction')$q$,
  'form_templates_name_not_blank',
  'a template with a blank name');

select pg_temp.assert_refused(
  $q$insert into form_templates (name, industry) values ('Daily Inspection', '')$q$,
  'form_templates_industry_not_blank',
  'a template with no industry');

-- The control: the same insert with both filled in is allowed, and the
-- defaults land — no tags, a timestamp, a fresh id.
do $$
declare
  v_id uuid;
  v_tags text[];
begin
  insert into form_templates (name, industry, description)
  values ('Daily Inspection', 'Construction', 'Site walk with photos')
  returning id, tags into v_id, v_tags;
  if v_id is null then raise exception 'no id assigned'; end if;
  if v_tags <> '{}'::text[] then raise exception 'tags did not default to empty'; end if;
  raise notice 'ok — allowed: a named template in an industry';
end $$;

-- The industry lookup the intake uses is case-insensitive by index; the
-- probe just confirms the expression index exists rather than trusting it.
do $$
begin
  if not exists (
    select 1 from pg_indexes where tablename = 'form_templates'
      and indexdef ilike '%lower(industry)%'
  ) then
    raise exception 'form_templates has no lower(industry) index';
  end if;
  raise notice 'ok — the industry index is an expression index on lower()';
end $$;

-- Intake: an object is stored; anything that is not an object is refused.
insert into portal_accounts (id, name, stage)
values ('00000000-0000-4000-8000-00000000d047', 'Probe Deal', 'closed_won');

do $$
begin
  update portal_accounts
     set intake = '{"forms_built": false, "industry": "Construction", "field_users": 24}'::jsonb
   where id = '00000000-0000-4000-8000-00000000d047';
  raise notice 'ok — allowed: intake answers as an object';
end $$;

select pg_temp.assert_refused(
  $q$update portal_accounts set intake = '"just a string"'::jsonb
      where id = '00000000-0000-4000-8000-00000000d047'$q$,
  'portal_accounts_intake_is_object',
  'intake stored as a bare string');

select pg_temp.assert_refused(
  $q$update portal_accounts set intake = '[1,2,3]'::jsonb
      where id = '00000000-0000-4000-8000-00000000d047'$q$,
  'portal_accounts_intake_is_object',
  'intake stored as an array');

-- Null is fine: a deal that has not been through intake has nothing to say.
do $$
begin
  update portal_accounts set intake = null
   where id = '00000000-0000-4000-8000-00000000d047';
  raise notice 'ok — allowed: no intake yet';
end $$;

-- RLS is on. A table without it is a future anon-key read away from
-- listing the library.
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'form_templates' and c.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on form_templates';
  end if;
  raise notice 'ok — RLS enabled on form_templates';
end $$;

rollback;
