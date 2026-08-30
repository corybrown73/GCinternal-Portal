-- 0029 — One conversation per project, shared by both sides.
--
-- The gap this closes: today the only customer-visible writing surface is a
-- comment on a single work item (0021). That is a per-task side channel, not a
-- conversation. There is nowhere for "we need to move the kickoff" to live, no
-- way to bring a named person into a thread, and no way for anyone to see the
-- whole exchange in one place. So the exchange happens in email, which is
-- exactly the place the hub was built to replace.
--
-- The shape:
--
--   project_conversations       one per implementation. A customer with three
--                               projects has three threads, which is the same
--                               grain as the plan, the grant and the board.
--   conversation_participants   who is in it — internal profiles and customer
--                               contacts in ONE table, because "tag everyone in
--                               the project" has to reach both.
--   conversation_messages       the thread. Each message is shared or internal.
--   conversation_mentions       resolved @handles. Rows, not a parse of the
--                               body, so a notification is auditable and a
--                               renamed person does not silently un-mention.
--   conversation_reads          per participant, so "unread" is a fact rather
--                               than a guess.
--
-- THE INVARIANT THIS MIGRATION EXISTS TO ENFORCE. An internal message must
-- never reach a customer, and there are four distinct ways it could:
--
--   1. an external author writes something marked internal   -> trigger, below
--   2. an internal message is mentioned to a customer contact -> trigger, below
--   3. a shared message is re-marked internal after they read it, so the record
--      of what they saw disagrees with what is stored       -> trigger, below
--   4. the "last activity" timestamp on the external surface moves when an
--      internal note is posted, which tells the customer a conversation they
--      cannot see is happening  -> two columns, last_message_at and
--      last_shared_message_at; the external door reads only the second
--
-- App code checks the first three as well, so the UI can say something useful.
-- The triggers are the guarantee: every app path runs on the service role and
-- bypasses RLS, so RLS here is defense in depth and nothing more.
--
-- Rollback: supabase/down/0029_down.sql

-- ---------------------------------------------------------------------------
-- A. The thread
-- ---------------------------------------------------------------------------
create table project_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),

  -- One per project. Not per customer: a customer with a rollout and an
  -- integration running six months apart has two audiences, two timelines and
  -- two sets of tasks, and merging their threads helps nobody.
  implementation_id uuid not null unique references implementations (id) on delete cascade,
  -- Denormalized so a thread can be scoped to a customer without a join. The
  -- trigger below makes it impossible for this to disagree with the
  -- implementation's customer — the same rule, and the same reason, as
  -- external_access_grants.customer_id in 0019.
  customer_id uuid not null references customers (id) on delete cascade,

  -- Both maintained by trigger. The external door reads ONLY the second: see
  -- leak #4 in the header.
  last_message_at timestamptz,
  last_shared_message_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_conversations_customer_idx
  on project_conversations (customer_id, last_message_at desc);

create trigger project_conversations_touch before update on project_conversations
  for each row execute function portal_touch_updated_at();

comment on table project_conversations is
  'One shared conversation per implementation. last_shared_message_at is the only '
  'activity timestamp the external portal may read — see 0029 header, leak #4.';

create or replace function project_conversation_enforce()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  impl_customer uuid;
begin
  select customer_id into impl_customer
    from implementations where id = new.implementation_id;
  if impl_customer is null then
    raise exception 'project_conversations: implementation % does not exist',
      new.implementation_id;
  end if;
  if new.customer_id <> impl_customer then
    raise exception
      'project_conversations: customer_id % is not the customer of implementation %',
      new.customer_id, new.implementation_id;
  end if;
  if tg_op = 'UPDATE' and new.implementation_id is distinct from old.implementation_id then
    raise exception 'project_conversations.implementation_id is immutable';
  end if;
  return new;
end $$;

create trigger project_conversations_enforce
  before insert or update on project_conversations
  for each row execute function project_conversation_enforce();

-- ---------------------------------------------------------------------------
-- B. Who is in it
-- ---------------------------------------------------------------------------
-- Internal staff and customer contacts share one table on purpose. "Tag
-- everyone in the project" is one list or it is not one place, and a mention
-- that can only reach one side of the room is the failure this whole feature
-- exists to fix.
create table conversation_participants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  conversation_id uuid not null references project_conversations (id) on delete cascade,

  party_kind text not null check (party_kind in ('internal', 'external')),
  -- Exactly one is set, and it has to be the one party_kind names. Both checks
  -- are needed: the first stops a participant with no person behind it, the
  -- second stops an external participant secretly pointing at a staff profile.
  profile_id uuid references portal_profiles (id) on delete set null,
  contact_id uuid references customer_contacts (id) on delete set null,

  -- SNAPSHOTS. A message from eight months ago has to still render the name it
  -- was written under, and a mention has to still resolve after the person
  -- leaves and their profile row is gone. The live row is the source of truth
  -- while it exists; these are what remains when it does not.
  display_name text not null,
  email text,

  -- The @handle. Unique per conversation INCLUDING removed participants, so a
  -- handle can never be recycled onto a different human — that would silently
  -- change who an old message was addressed to, and the old message is
  -- evidence.
  handle text not null,

  -- Off means "in the thread, but do not email me". A mention still writes a
  -- mention row; see the fan-out rules in conversation.server.ts.
  notify boolean not null default true,

  added_at timestamptz not null default now(),
  added_by uuid references portal_profiles (id) on delete set null,
  removed_at timestamptz,

  constraint conversation_participants_party_check check (
    (party_kind = 'internal' and profile_id is not null and contact_id is null)
    or
    (party_kind = 'external' and contact_id is not null and profile_id is null)
  ),
  constraint conversation_participants_handle_shape
    check (handle ~ '^[a-z][a-z0-9._-]{1,38}[a-z0-9]$'),
  constraint conversation_participants_name_shape
    check (length(btrim(display_name)) between 1 and 120)
);

-- Handles are matched case-insensitively when parsing a body, so they must be
-- unique case-insensitively too.
create unique index conversation_participants_handle_idx
  on conversation_participants (conversation_id, lower(handle));

-- One live membership per person per thread. Re-adding somebody who was
-- removed clears removed_at on the existing row rather than making a second
-- one, which is what keeps their handle and their read cursor.
create unique index conversation_participants_profile_idx
  on conversation_participants (conversation_id, profile_id)
  where profile_id is not null;
create unique index conversation_participants_contact_idx
  on conversation_participants (conversation_id, contact_id)
  where contact_id is not null;

create index conversation_participants_conv_idx
  on conversation_participants (conversation_id) where removed_at is null;

-- A profile or contact row can be deleted out from under a participant (both
-- FKs are ON DELETE SET NULL, because losing the whole participant would lose
-- the thread's history of who was in it). When that happens the party_check
-- above would fail on any later UPDATE of the row, so it is enforced only
-- against rows that still have their person. This trigger is what keeps the
-- INSERT path strict.
create or replace function conversation_participant_enforce()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.conversation_id is distinct from old.conversation_id then
      raise exception 'conversation_participants.conversation_id is immutable';
    end if;
    if new.party_kind is distinct from old.party_kind then
      raise exception 'conversation_participants.party_kind is immutable';
    end if;
    if lower(new.handle) is distinct from lower(old.handle) then
      raise exception
        'A participant handle is how past messages address this person and cannot be changed (@% -> @%)',
        old.handle, new.handle;
    end if;
    return new;
  end if;

  -- INSERT: the person must belong where the thread is.
  if new.party_kind = 'external' then
    if not exists (
      select 1
        from customer_contacts c
        join project_conversations pc on pc.id = new.conversation_id
       where c.id = new.contact_id and c.customer_id = pc.customer_id
    ) then
      raise exception
        'conversation_participants: contact % is not a contact of this project''s customer',
        new.contact_id;
    end if;
  end if;
  return new;
end $$;

create trigger conversation_participants_enforce
  before insert or update on conversation_participants
  for each row execute function conversation_participant_enforce();

-- ---------------------------------------------------------------------------
-- C. The messages
-- ---------------------------------------------------------------------------
create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  conversation_id uuid not null references project_conversations (id) on delete cascade,

  author_kind text not null check (author_kind in ('internal', 'external', 'system')),
  author_profile_id uuid references portal_profiles (id) on delete set null,
  author_contact_id uuid references customer_contacts (id) on delete set null,
  -- Which link the message came through. The grant id is not a credential, and
  -- recording it is how "who actually typed this" survives a contact being
  -- reassigned later.
  author_grant_id uuid references external_access_grants (id) on delete set null,
  -- NOT NULL, unlike the ids above. A message whose author row is deleted must
  -- still say who wrote it; an unattributed message in a shared thread is worse
  -- than no message.
  author_name text not null,

  -- 'shared' is visible to the customer through every external door.
  -- 'internal' is never rendered to a customer by any door, ever.
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),

  body text not null,

  -- Withdrawal keeps the body. Hiding what a customer has already read would
  -- make the record disagree with what happened; the DTO renders a withdrawn
  -- message as withdrawn and omits the text.
  deleted_at timestamptz,
  deleted_by uuid references portal_profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  edited_at timestamptz,

  constraint conversation_messages_body_shape
    check (length(btrim(body)) between 1 and 20000),
  constraint conversation_messages_author_check check (
    (author_kind = 'internal' and author_profile_id is not null and author_contact_id is null)
    or
    (author_kind = 'external' and author_contact_id is not null and author_profile_id is null)
    or
    (author_kind = 'system' and author_profile_id is null and author_contact_id is null)
  )
);

create index conversation_messages_thread_idx
  on conversation_messages (conversation_id, created_at);
-- The external door's read path: shared only, in order. Partial so it stays
-- small and so the planner cannot accidentally serve it from the wider index.
create index conversation_messages_shared_idx
  on conversation_messages (conversation_id, created_at)
  where visibility = 'shared';

-- Leaks #1 and #3 from the header.
create or replace function conversation_message_enforce()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- #1. A customer cannot write into the internal side of the thread. This
    -- is not a UI concern: the external write path runs on the service role,
    -- so nothing but this stands between a bad parameter and an internal note
    -- authored by an outsider.
    if new.author_kind = 'external' and new.visibility <> 'shared' then
      raise exception
        'An external author can only post a shared message (got visibility=%)',
        new.visibility;
    end if;
    return new;
  end if;

  if new.conversation_id is distinct from old.conversation_id
     or new.author_kind is distinct from old.author_kind
     or new.author_profile_id is distinct from old.author_profile_id
     or new.author_contact_id is distinct from old.author_contact_id
     or new.author_name is distinct from old.author_name
     or new.created_at is distinct from old.created_at then
    raise exception 'conversation_messages: authorship and placement are immutable';
  end if;

  -- #3. Sharing an internal note later is a deliberate, forward move and is
  -- allowed. Un-sharing is not: the customer may already have read it, and a
  -- record that says otherwise is a false record.
  if old.visibility = 'shared' and new.visibility = 'internal' then
    raise exception
      'A message that was shared with the customer cannot be made internal. Withdraw it instead.';
  end if;
  if new.author_kind = 'external' and new.visibility <> 'shared' then
    raise exception 'An external author''s message can only be shared';
  end if;

  return new;
end $$;

create trigger conversation_messages_enforce
  before insert or update on conversation_messages
  for each row execute function conversation_message_enforce();

-- Leak #4: two timestamps, and the shared one moves only for shared traffic.
create or replace function conversation_bump_activity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update project_conversations
     set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at),
         last_shared_message_at = case
           when new.visibility = 'shared'
             then greatest(coalesce(last_shared_message_at, new.created_at), new.created_at)
           else last_shared_message_at
         end
   where id = new.conversation_id;
  return null;
end $$;

-- AFTER INSERT only. An edit does not count as activity: bumping the thread
-- because somebody fixed a typo is how a notification stops meaning anything.
create trigger conversation_messages_bump
  after insert on conversation_messages
  for each row execute function conversation_bump_activity();

-- ---------------------------------------------------------------------------
-- D. Mentions
-- ---------------------------------------------------------------------------
-- Rows rather than a re-parse of the body at render time. Three reasons: a
-- notification that was sent is a fact and needs somewhere to live; renaming a
-- participant must not retroactively un-mention them; and the guard below can
-- only exist if the mention is a row.
create table conversation_mentions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  message_id uuid not null references conversation_messages (id) on delete cascade,
  participant_id uuid not null references conversation_participants (id) on delete cascade,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index conversation_mentions_unique_idx
  on conversation_mentions (message_id, participant_id);
create index conversation_mentions_participant_idx
  on conversation_mentions (participant_id, created_at desc);

-- Leak #2, and the one most likely to happen by accident: an internal note that
-- names a customer contact would, without this, email that contact about a
-- message they cannot open.
create or replace function conversation_mention_enforce()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_visibility text;
  v_msg_conv uuid;
  v_part_conv uuid;
  v_part_kind text;
begin
  select visibility, conversation_id into v_visibility, v_msg_conv
    from conversation_messages where id = new.message_id;
  select conversation_id, party_kind into v_part_conv, v_part_kind
    from conversation_participants where id = new.participant_id;

  if v_msg_conv is null or v_part_conv is null then
    raise exception 'conversation_mentions: message or participant does not exist';
  end if;
  if v_msg_conv <> v_part_conv then
    raise exception
      'conversation_mentions: participant belongs to a different conversation than the message';
  end if;
  if v_visibility = 'internal' and v_part_kind = 'external' then
    raise exception
      'An internal message cannot mention a customer contact — they would be notified about a message they cannot read';
  end if;
  return new;
end $$;

create trigger conversation_mentions_enforce
  before insert or update on conversation_mentions
  for each row execute function conversation_mention_enforce();

-- The other direction of leak #2: internal -> shared is allowed (section C),
-- but shared -> internal on a message that already mentions a contact would
-- leave an orphaned external mention behind. That transition is refused
-- outright above, so the only remaining case is a message going internal ->
-- shared, which can never create a violation. Nothing to do here, and this
-- comment exists so the next reader does not go looking for a trigger that
-- should not be written.

-- ---------------------------------------------------------------------------
-- E. Read state
-- ---------------------------------------------------------------------------
-- Per participant, so "3 unread" is counted rather than estimated. A row is
-- written when somebody opens the thread; no row means they have never opened
-- it, which is different from having read nothing.
create table conversation_reads (
  conversation_id uuid not null references project_conversations (id) on delete cascade,
  participant_id uuid not null references conversation_participants (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, participant_id)
);

-- ---------------------------------------------------------------------------
-- F. RLS and grants
-- ---------------------------------------------------------------------------
-- Defense in depth only — every app path runs on the service role. What these
-- buy is that a PostgREST caller holding an ordinary JWT cannot read the
-- internal side of a thread, and that is worth having given the anon endpoint
-- is publicly reachable.
alter table project_conversations enable row level security;
alter table conversation_participants enable row level security;
alter table conversation_messages enable row level security;
alter table conversation_mentions enable row level security;
alter table conversation_reads enable row level security;

create policy "conversations internal" on project_conversations
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "participants internal" on conversation_participants
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "messages internal" on conversation_messages
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "mentions internal" on conversation_mentions
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());
create policy "reads internal" on conversation_reads
  for all to authenticated using (portal_is_internal()) with check (portal_is_internal());

-- Customer-auth read, honouring the implementation scope from 0011. Shared
-- messages only — the `visibility = 'shared'` predicate is the RLS half of the
-- invariant the triggers above enforce.
create policy "conversations customer select" on project_conversations
  for select to authenticated
  using (
    exists (
      select 1 from customer_users cu
       where cu.profile_id = auth.uid()
         and cu.customer_id = project_conversations.customer_id
         and (cu.implementation_id is null
              or cu.implementation_id = project_conversations.implementation_id)
    )
  );

create policy "messages customer select" on conversation_messages
  for select to authenticated
  using (
    visibility = 'shared'
    and deleted_at is null
    and exists (
      select 1
        from project_conversations pc
        join customer_users cu on cu.customer_id = pc.customer_id
       where pc.id = conversation_messages.conversation_id
         and cu.profile_id = auth.uid()
         and (cu.implementation_id is null or cu.implementation_id = pc.implementation_id)
    )
  );

grant select on project_conversations, conversation_messages to authenticated;
grant select, insert, update, delete
  on project_conversations, conversation_participants, conversation_messages,
     conversation_mentions, conversation_reads
  to service_role;
