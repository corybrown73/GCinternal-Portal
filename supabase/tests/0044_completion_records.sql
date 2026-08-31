-- Invariant probes for the completion record (0044).
--
-- Each asserts the operation is refused AND refused for the expected reason.
-- Runs inside one transaction and rolls back. Requires ON_ERROR_STOP=1.

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

-- Two accounts, each with a project, and a solution on the second. Enough to
-- ask whether one account's work can be filed under the other.
create temp table t_fixture (k text primary key, v uuid);

do $$
declare a_cust uuid; b_cust uuid; a_impl uuid; b_impl uuid; b_sol uuid;
begin
  insert into customers (name) values ('Probe A') returning id into a_cust;
  insert into customers (name) values ('Probe B') returning id into b_cust;
  insert into implementations (customer_id, name, current_stage)
    values (a_cust, 'A project', 'onboarding') returning id into a_impl;
  insert into implementations (customer_id, name, current_stage)
    values (b_cust, 'B project', 'onboarding') returning id into b_impl;
  insert into technical_solutions (implementation_id, title, status)
    values (b_impl, 'B solution', 'validated') returning id into b_sol;
  insert into t_fixture values ('a_impl', a_impl), ('b_impl', b_impl), ('b_sol', b_sol);
end $$;

-- ---------------------------------------------------------------------------
-- A solution cannot be filed as another account's completion
-- ---------------------------------------------------------------------------
-- The failure this stops: account A's delivered-work list quietly containing
-- work done for account B. No FK can hold it — subject_id points at two
-- different tables — so it is a trigger or it is nothing.
select pg_temp.assert_refused(
  format($q$insert into completion_records
      (implementation_id, subject_type, subject_id, version, title, content, summary_text, share_token_hash)
    values (%L, 'solution', %L, 1, 'Wrong account', '{}'::jsonb, 'x', 'h1')$q$,
    (select v from t_fixture where k = 'a_impl'),
    (select v from t_fixture where k = 'b_sol')),
  'belongs to implementation',
  'filing a solution under an implementation it does not belong to');

-- A subject that does not exist at all is the same class of error.
select pg_temp.assert_refused(
  format($q$insert into completion_records
      (implementation_id, subject_type, subject_id, version, title, content, summary_text, share_token_hash)
    values (%L, 'solution', '00000000-0000-4000-8000-0000000000ff', 1, 'Ghost', '{}'::jsonb, 'x', 'h2')$q$,
    (select v from t_fixture where k = 'a_impl')),
  'no solution',
  'filing a completion against a solution that does not exist');

-- An implementation record must be its own subject. Anything else is a record
-- of project A stored under project B with no way to tell.
select pg_temp.assert_refused(
  format($q$insert into completion_records
      (implementation_id, subject_type, subject_id, version, title, content, summary_text, share_token_hash)
    values (%L, 'implementation', %L, 1, 'Mismatched', '{}'::jsonb, 'x', 'h3')$q$,
    (select v from t_fixture where k = 'a_impl'),
    (select v from t_fixture where k = 'b_impl')),
  'must be its own subject',
  'an implementation completion whose subject is a different implementation');

-- ---------------------------------------------------------------------------
-- Versions are assigned by the database
-- ---------------------------------------------------------------------------
-- A caller that computes its own version can hand back one that already
-- exists. The passed value is ignored, so two records of the same subject get
-- 1 and 2 even when both callers insist on 1.
do $$
declare a_impl uuid; v1 int; v2 int;
begin
  a_impl := (select v from t_fixture where k = 'a_impl');
  insert into completion_records
    (implementation_id, subject_type, subject_id, version, title, content, summary_text, share_token_hash)
  values (a_impl, 'implementation', a_impl, 1, 'First', '{}'::jsonb, 'body', 'tok-1')
  returning version into v1;
  insert into completion_records
    (implementation_id, subject_type, subject_id, version, title, content, summary_text, share_token_hash)
  values (a_impl, 'implementation', a_impl, 1, 'Second', '{}'::jsonb, 'body', 'tok-2')
  returning version into v2;
  if v1 <> 1 or v2 <> 2 then
    raise exception 'INVARIANT NOT ENFORCED: versions were % and %, expected 1 and 2', v1, v2;
  end if;
  raise notice 'ok — the database numbered the reissue: % then %', v1, v2;
end $$;

-- ---------------------------------------------------------------------------
-- Two records cannot share a token
-- ---------------------------------------------------------------------------
-- The token is the whole of the authorization on /api/completion-record/{token}.
select pg_temp.assert_refused(
  format($q$insert into completion_records
      (implementation_id, subject_type, subject_id, version, title, content, summary_text, share_token_hash)
    values (%L, 'implementation', %L, 1, 'Third', '{}'::jsonb, 'body', 'tok-1')$q$,
    (select v from t_fixture where k = 'a_impl'),
    (select v from t_fixture where k = 'a_impl')),
  'completion_records_token_idx',
  'two completion records sharing one share token');

-- ---------------------------------------------------------------------------
-- An issued record is frozen
-- ---------------------------------------------------------------------------
-- The promise the whole table exists to make: a PDF of a completion record
-- shows what the work looked like when it finished. An UPDATE to content is
-- how that promise would be broken quietly.
select pg_temp.assert_refused(
  $q$update completion_records set content = '{"tampered":true}'::jsonb where share_token_hash = 'tok-1'$q$,
  'frozen',
  'editing the content of an issued completion record');

select pg_temp.assert_refused(
  $q$update completion_records set summary_text = 'rewritten' where share_token_hash = 'tok-1'$q$,
  'frozen',
  'rewriting the note body of an issued completion record');

-- The freeze is on the document, not the row: the Salesforce link can still be
-- filled in after the fact, and the attachment listing can still be attached.
do $$
begin
  update completion_records set salesforce_account_id = '001xx' where share_token_hash = 'tok-1';
  if not found then
    raise exception 'INVARIANT WRONG: the freeze blocked a non-document field';
  end if;
  raise notice 'ok — allowed: recording where the note was filed, after the fact';
end $$;

rollback;
