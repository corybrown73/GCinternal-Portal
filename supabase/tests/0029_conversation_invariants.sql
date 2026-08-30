-- Invariant probes for 0029_conversations.sql.
--
-- WHY THIS FILE EXISTS. The conversation schema's whole safety argument is four
-- triggers. A later migration that does `create or replace function
-- conversation_message_enforce()` — or drops a trigger while renaming a table —
-- would remove one of them silently: the migration cycle would still be green,
-- the app would still work, and the only symptom would be an internal note
-- reaching a customer months later. A schema whose guarantees are triggers
-- needs a test that the triggers still refuse things.
--
-- Every probe asserts BOTH that the operation was refused and that it was
-- refused for the expected reason, because a foreign key firing first would
-- otherwise let a removed trigger pass as enforcement.
--
-- Runs inside one transaction and rolls back: it leaves no rows behind.
-- Requires ON_ERROR_STOP=1 to fail the build.

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
-- Fixtures
-- ---------------------------------------------------------------------------
-- `allowed_email_domains` is a jsonb ARRAY of domain strings and the signup
-- trigger tests it with `?`, so the test domain has to be appended as an
-- element. Rolled back with everything else; the real allowlist is untouched.
insert into portal_app_config (key, value)
  values ('allowed_email_domains', '["invariants.test"]'::jsonb)
  on conflict (key) do update set value =
    case when portal_app_config.value ? 'invariants.test'
         then portal_app_config.value
         else portal_app_config.value || '["invariants.test"]'::jsonb end;

insert into customers (id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Probe Customer'),
  ('22222222-2222-4222-8222-222222222222', 'Unrelated Customer');

insert into implementations (id, customer_id, name, current_stage) values
  ('aaaaaaaa-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Probe Project', 'kickoff'),
  ('aaaaaaaa-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Unrelated Project', 'kickoff');

insert into customer_contacts (id, customer_id, name, role, email) values
  ('cccccccc-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Probe Contact', 'champion', 'contact@invariants.test'),
  ('cccccccc-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'Unrelated Contact', 'champion', 'other@invariants.test');

insert into auth.users (id, email) values
  ('dddddddd-1111-4111-8111-111111111111', 'staff@invariants.test');
-- The profile row is created by the portal_handle_new_user trigger on that
-- insert. It is NOT given a manager role here: portal_guard_role_change
-- refuses that outside an admin session, and none of the probes below need it —
-- they write to the tables directly, which is exactly what the service-role app
-- path does and therefore exactly what the triggers have to withstand.
insert into portal_profiles (id, email, full_name)
  values ('dddddddd-1111-4111-8111-111111111111', 'staff@invariants.test', 'Probe Staff')
  on conflict (id) do nothing;

insert into project_conversations (id, implementation_id, customer_id)
  values ('eeeeeeee-1111-4111-8111-111111111111', 'aaaaaaaa-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');
insert into project_conversations (id, implementation_id, customer_id)
  values ('eeeeeeee-2222-4222-8222-222222222222', 'aaaaaaaa-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222');

insert into conversation_participants (id, conversation_id, party_kind, profile_id, display_name, email, handle) values
  ('ffffffff-1111-4111-8111-111111111111', 'eeeeeeee-1111-4111-8111-111111111111', 'internal',
   'dddddddd-1111-4111-8111-111111111111', 'Probe Staff', 'staff@invariants.test', 'staff');
insert into conversation_participants (id, conversation_id, party_kind, contact_id, display_name, email, handle) values
  ('ffffffff-2222-4222-8222-222222222222', 'eeeeeeee-1111-4111-8111-111111111111', 'external',
   'cccccccc-1111-4111-8111-111111111111', 'Probe Contact', 'contact@invariants.test', 'contact');
insert into conversation_participants (id, conversation_id, party_kind, contact_id, display_name, handle) values
  ('ffffffff-3333-4333-8333-333333333333', 'eeeeeeee-2222-4222-8222-222222222222', 'external',
   'cccccccc-2222-4222-8222-222222222222', 'Unrelated Contact', 'elsewhere');

insert into conversation_messages (id, conversation_id, author_kind, author_profile_id, author_name, visibility, body) values
  ('99999999-1111-4111-8111-111111111111', 'eeeeeeee-1111-4111-8111-111111111111', 'internal',
   'dddddddd-1111-4111-8111-111111111111', 'Probe Staff', 'internal', 'internal note'),
  ('99999999-2222-4222-8222-222222222222', 'eeeeeeee-1111-4111-8111-111111111111', 'internal',
   'dddddddd-1111-4111-8111-111111111111', 'Probe Staff', 'shared', 'shared message');

-- ---------------------------------------------------------------------------
-- Leak 1 — a customer cannot write into the internal side
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused($$
  insert into conversation_messages (conversation_id, author_kind, author_contact_id, author_name, visibility, body)
  values ('eeeeeeee-1111-4111-8111-111111111111','external','cccccccc-1111-4111-8111-111111111111','Probe Contact','internal','x')
$$, 'external author can only post a shared message',
   'an external author posting an internal message');

-- ---------------------------------------------------------------------------
-- Leak 2 — an internal message cannot notify a customer contact
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused($$
  insert into conversation_mentions (message_id, participant_id)
  values ('99999999-1111-4111-8111-111111111111','ffffffff-2222-4222-8222-222222222222')
$$, 'cannot mention a customer contact',
   'mentioning a customer contact on an internal message');

select pg_temp.assert_allowed($$
  insert into conversation_mentions (message_id, participant_id)
  values ('99999999-1111-4111-8111-111111111111','ffffffff-1111-4111-8111-111111111111')
$$, 'mentioning a colleague on an internal message');

select pg_temp.assert_allowed($$
  insert into conversation_mentions (message_id, participant_id)
  values ('99999999-2222-4222-8222-222222222222','ffffffff-2222-4222-8222-222222222222')
$$, 'mentioning a customer contact on a shared message');

select pg_temp.assert_refused($$
  insert into conversation_mentions (message_id, participant_id)
  values ('99999999-2222-4222-8222-222222222222','ffffffff-3333-4333-8333-333333333333')
$$, 'different conversation',
   'mentioning a participant from another conversation');

-- ---------------------------------------------------------------------------
-- Leak 3 — what was shared stays shared
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused($$
  update conversation_messages set visibility='internal' where id='99999999-2222-4222-8222-222222222222'
$$, 'cannot be made internal',
   'un-sharing a message the customer may already have read');

select pg_temp.assert_allowed($$
  update conversation_messages set visibility='shared' where id='99999999-1111-4111-8111-111111111111'
$$, 'sharing an internal note (the forward direction)');

-- ---------------------------------------------------------------------------
-- Leak 4 — the external activity clock does not move for internal traffic
-- ---------------------------------------------------------------------------
do $$
declare
  v_lm timestamptz;
  v_ls timestamptz;
  v_lm2 timestamptz;
  v_ls2 timestamptz;
begin
  select last_message_at, last_shared_message_at into v_lm, v_ls
    from project_conversations where id = 'eeeeeeee-1111-4111-8111-111111111111';

  -- created_at is passed explicitly. Everything in this file runs in one
  -- transaction, where now() is frozen, so the default would give this message
  -- the same timestamp as the fixtures and "did the clock move" would be
  -- unanswerable. In the app each message is its own transaction.
  insert into conversation_messages (conversation_id, author_kind, author_profile_id, author_name, visibility, body, created_at)
  values ('eeeeeeee-1111-4111-8111-111111111111','internal','dddddddd-1111-4111-8111-111111111111',
          'Probe Staff','internal','a note posted after the last shared message', now() + interval '1 minute');

  select last_message_at, last_shared_message_at into v_lm2, v_ls2
    from project_conversations where id = 'eeeeeeee-1111-4111-8111-111111111111';

  if v_lm2 <= v_lm then
    raise exception 'INVARIANT NOT ENFORCED: an internal message did not move last_message_at';
  end if;
  if v_ls2 is distinct from v_ls then
    raise exception
      'INVARIANT NOT ENFORCED: an internal message moved last_shared_message_at — the customer can now see that a conversation they cannot read is happening';
  end if;
  raise notice 'ok — the external activity clock held across an internal message';
end $$;

-- ---------------------------------------------------------------------------
-- Identity and history
-- ---------------------------------------------------------------------------
select pg_temp.assert_refused($$
  update conversation_messages set author_name='Someone Else' where id='99999999-2222-4222-8222-222222222222'
$$, 'authorship and placement are immutable',
   'rewriting who wrote a message');

select pg_temp.assert_refused($$
  update conversation_participants set handle='staffer' where id='ffffffff-1111-4111-8111-111111111111'
$$, 'cannot be changed',
   'changing a handle that past messages address');

select pg_temp.assert_refused($$
  insert into conversation_participants (conversation_id, party_kind, profile_id, display_name, handle)
  values ('eeeeeeee-1111-4111-8111-111111111111','internal','dddddddd-1111-4111-8111-111111111111','Dup','staff')
$$, 'duplicate key',
   'reusing a handle inside one conversation');

select pg_temp.assert_refused($$
  insert into conversation_participants (conversation_id, party_kind, contact_id, display_name, handle)
  values ('eeeeeeee-1111-4111-8111-111111111111','external','cccccccc-2222-4222-8222-222222222222','Unrelated','outsider')
$$, 'not a contact of this project',
   'adding another customer''s contact to a thread');

select pg_temp.assert_refused($$
  insert into project_conversations (implementation_id, customer_id)
  values ('aaaaaaaa-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')
$$, 'is not the customer of implementation',
   'a conversation whose customer disagrees with its project');

select pg_temp.assert_refused($$
  insert into project_conversations (implementation_id, customer_id)
  values ('aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111')
$$, 'duplicate key',
   'a second conversation on one project');

select pg_temp.assert_refused($$
  insert into conversation_messages (conversation_id, author_kind, author_profile_id, author_name, body)
  values ('eeeeeeee-1111-4111-8111-111111111111','internal','dddddddd-1111-4111-8111-111111111111','Probe Staff','   ')
$$, 'body_shape',
   'a message with nothing in it');

rollback;
