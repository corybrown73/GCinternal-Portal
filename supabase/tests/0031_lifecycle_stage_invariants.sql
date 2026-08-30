-- Invariant probes for 0031_lifecycle_stages.sql.
--
-- The rule this schema exists to hold: labels, colours, intents and order are
-- freely editable, and NONE of that can break a rule the application code
-- enforces. Roughly twenty-five call sites name specific stage ids as literals
-- (`launch` for the launch gate, `adopt` and `graduate-to-cs` for graduation
-- and the CS handoff, `handoff` for where a new project lands). A migration
-- that let one of those be renamed away or deleted would disable those rules
-- silently, at some later date, with nothing failing at the time.
--
-- Runs inside one transaction and rolls back. Requires ON_ERROR_STOP=1.

begin;

create function pg_temp.assert_refused(p_sql text, p_fragment text, p_what text)
returns void language plpgsql as $fn$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'INVARIANT "%" was refused, but for the wrong reason. Expected a message containing "%", got: %',
        p_what, p_fragment, sqlerrm;
    end if;
    raise notice 'ok — refused: %', p_what;
    return;
  end;
  raise exception 'INVARIANT NOT ENFORCED: % was allowed', p_what;
end $fn$;

create function pg_temp.assert_allowed(p_sql text, p_what text)
returns void language plpgsql as $fn$
begin
  execute p_sql;
  raise notice 'ok — allowed: %', p_what;
exception when others then
  raise exception 'LEGITIMATE OPERATION REFUSED: % — %', p_what, sqlerrm;
end $fn$;

-- ---------------------------------------------------------------------------
-- The eight seeded stages are there
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from portal_lifecycle_stages where is_builtin;
  if n <> 8 then
    raise exception 'INVARIANT NOT ENFORCED: expected 8 built-in stages, found %', n;
  end if;
  raise notice 'ok — the eight built-in stages are seeded';
end $$;

-- ---------------------------------------------------------------------------
-- What editing is FOR
-- ---------------------------------------------------------------------------
-- These have to keep working, or the feature does not exist. Asserted as
-- explicitly as the refusals, because a schema that refuses everything also
-- passes every refusal test.
select pg_temp.assert_allowed($$
  update portal_lifecycle_stages set label = 'Embed' where key = 'adopt'
$$, 'renaming a built-in stage');

select pg_temp.assert_allowed($$
  update portal_lifecycle_stages set intent = 'Our own words for this one' where key = 'build'
$$, 'rewriting a stage intent');

select pg_temp.assert_allowed($$
  update portal_lifecycle_stages set color = 'risk' where key = 'launch'
$$, 'recolouring a stage');

select pg_temp.assert_allowed($$
  insert into portal_lifecycle_stages (key, label, phase, color, sort_order)
  values ('pilot', 'Pilot', 'delivery', 'idle', 99)
$$, 'adding a stage of your own');

-- ---------------------------------------------------------------------------
-- The key is the identity
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused($$
  update portal_lifecycle_stages set key = 'embed' where key = 'adopt'
$$, 'cannot be changed',
   'renaming the KEY of a stage the history refers to');

select pg_temp.assert_refused($$
  update portal_lifecycle_stages set is_builtin = false where key = 'graduate-to-cs'
$$, 'not a setting',
   'demoting a built-in stage so it could then be deleted');

select pg_temp.assert_refused($$
  update portal_lifecycle_stages set is_builtin = true where key = 'pilot'
$$, 'not a setting',
   'promoting a custom stage to built-in');

-- ---------------------------------------------------------------------------
-- Built-in stages cannot be deleted
-- ---------------------------------------------------------------------------
-- Each of these ids is named directly by application code. Deleting one would
-- disable a rule rather than raise an error.
select pg_temp.assert_refused($$
  delete from portal_lifecycle_stages where key = 'launch'
$$, 'keys off it',
   'deleting the stage the launch gate names');

select pg_temp.assert_refused($$
  delete from portal_lifecycle_stages where key = 'graduate-to-cs'
$$, 'keys off it',
   'deleting the stage graduation and the CS handoff name');

select pg_temp.assert_refused($$
  delete from portal_lifecycle_stages where key = 'handoff'
$$, 'keys off it',
   'deleting the stage a new project lands in');

-- ---------------------------------------------------------------------------
-- An occupied custom stage cannot be deleted either
-- ---------------------------------------------------------------------------
do $$
declare v_customer uuid := '00000000-3333-4333-8333-000000000001';
begin
  insert into customers (id, name) values (v_customer, 'Probe Customer');
  insert into implementations (id, customer_id, name, current_stage)
    values ('00000000-3333-4333-8333-000000000002', v_customer, 'Probe Project', 'pilot');
end $$;

select pg_temp.assert_refused($$
  delete from portal_lifecycle_stages where key = 'pilot'
$$, 'project(s) are in it',
   'deleting a custom stage that still has projects in it');

-- ...but an EMPTY custom stage is deletable. A configuration that can only ever
-- grow is not a configuration.
do $$
begin
  update implementations set current_stage = 'build'
   where id = '00000000-3333-4333-8333-000000000002';
end $$;

select pg_temp.assert_allowed($$
  delete from portal_lifecycle_stages where key = 'pilot'
$$, 'deleting a custom stage nobody is in');

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused($$
  update portal_lifecycle_stages set color = '#ff0000' where key = 'build'
$$, 'color_check',
   'a raw hex colour instead of a theme token');

select pg_temp.assert_refused($$
  update portal_lifecycle_stages set label = '   ' where key = 'build'
$$, 'label_shape',
   'a stage with a blank label');

select pg_temp.assert_refused($$
  insert into portal_lifecycle_stages (key, label, phase, sort_order)
  values ('Bad Key', 'Bad', 'delivery', 98)
$$, 'key_shape',
   'a key that is not a slug');

select pg_temp.assert_refused($$
  insert into portal_lifecycle_stages (key, label, phase, sort_order)
  values ('elsewhere', 'Elsewhere', 'somewhere-else', 97)
$$, 'phase_check',
   'a phase that is not one of the four');

rollback;
