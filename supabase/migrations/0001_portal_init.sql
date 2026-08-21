-- GCinternal Portal — initial schema.
-- All objects are prefixed portal_ because this database is shared with an
-- unrelated prototype app; the prefix is the namespace boundary.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type portal_account_stage as enum
  ('prospect','closed_won','onboarding_kickoff','in_onboarding','onboarding_complete');
create type portal_transition_source as enum ('ui','api','csv_import','system');
create type portal_user_role as enum ('admin','am','se','onboarding');
create type portal_tam_status as enum ('pending','approved','declined','expired');
create type portal_brief_status as enum ('queued','generating','complete','failed');
create type portal_brief_generator as enum ('llm','template');
create type portal_gong_report_type as enum ('call_notes','account_map');
create type portal_note_review_status as enum ('needs_review','reviewed');

-- ---------------------------------------------------------------------------
-- App config (domain allowlist lives here so the signup trigger can read it)
-- ---------------------------------------------------------------------------
create table portal_app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into portal_app_config (key, value)
values ('allowed_email_domains', '["gocanvas.com"]'::jsonb);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table portal_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role portal_user_role not null default 'am',
  created_at timestamptz not null default now()
);

-- Domain allowlist is enforced HERE, not in the signup form, so it also
-- governs users created through OAuth providers enabled later.
-- First user to sign up becomes admin.
create or replace function portal_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  allowed jsonb;
  dom text;
  is_first boolean;
begin
  select value into allowed from portal_app_config where key = 'allowed_email_domains';
  dom := lower(split_part(new.email, '@', 2));
  if allowed is null or not (allowed ? dom) then
    raise exception 'Signups are restricted to approved email domains';
  end if;
  select not exists (select 1 from portal_profiles) into is_first;
  insert into portal_profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when is_first then 'admin'::portal_user_role else 'am'::portal_user_role end
  );
  return new;
end;
$$;

create trigger portal_on_auth_user_created
  after insert on auth.users
  for each row execute function portal_handle_new_user();

create or replace function portal_guard_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not portal_is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- API keys (created before stage_transitions for the FK)
-- ---------------------------------------------------------------------------
create table portal_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Accounts + stage machine
-- ---------------------------------------------------------------------------
create table portal_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  salesforce_id text unique,
  stage portal_account_stage not null default 'prospect',
  arr numeric,
  products text[] not null default '{}',
  am_owner_id uuid references portal_profiles (id),
  se_owner_id uuid references portal_profiles (id),
  summary text,
  stage_entered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index portal_accounts_lower_name_idx on portal_accounts (lower(name));
create index portal_accounts_stage_idx on portal_accounts (stage);

create or replace function portal_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger portal_accounts_touch before update on portal_accounts
  for each row execute function portal_touch_updated_at();

create table portal_stage_transitions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references portal_accounts (id) on delete cascade,
  from_stage portal_account_stage,
  to_stage portal_account_stage not null,
  source portal_transition_source not null,
  actor_profile_id uuid references portal_profiles (id),
  actor_api_key_id uuid references portal_api_keys (id),
  note text,
  occurred_at timestamptz not null default now()
);
create index portal_stage_transitions_account_idx
  on portal_stage_transitions (account_id, occurred_at desc);

-- accounts.stage may only change through portal_transition_stage(), which is
-- the single funnel shared by UI, public API, and CSV import — guaranteeing a
-- history row for every change.
create or replace function portal_guard_stage_change()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage
     and coalesce(current_setting('app.allow_stage_change', true), '') <> 'on' then
    raise exception 'Stage changes must go through portal_transition_stage()';
  end if;
  return new;
end;
$$;
create trigger portal_accounts_stage_guard before update on portal_accounts
  for each row execute function portal_guard_stage_change();

create or replace function portal_transition_stage(
  p_account_id uuid,
  p_to_stage portal_account_stage,
  p_source portal_transition_source default 'ui',
  p_actor_profile uuid default null,
  p_actor_api_key uuid default null,
  p_note text default null,
  p_occurred_at timestamptz default null
) returns portal_stage_transitions
language plpgsql
security definer set search_path = public
as $$
declare
  v_from portal_account_stage;
  v_row portal_stage_transitions;
begin
  -- A signed-in caller can only act as themselves via the UI; service-role
  -- callers (public API, CSV import) have no auth.uid() and pass actors in.
  if auth.uid() is not null then
    p_actor_profile := auth.uid();
    p_source := 'ui';
    p_actor_api_key := null;
  end if;

  select stage into v_from from portal_accounts where id = p_account_id for update;
  if not found then
    raise exception 'Account % not found', p_account_id;
  end if;
  if v_from = p_to_stage then
    return null;
  end if;

  perform set_config('app.allow_stage_change', 'on', true);
  update portal_accounts
    set stage = p_to_stage,
        stage_entered_at = coalesce(p_occurred_at, now())
    where id = p_account_id;
  perform set_config('app.allow_stage_change', '', true);

  insert into portal_stage_transitions
    (account_id, from_stage, to_stage, source, actor_profile_id, actor_api_key_id, note, occurred_at)
  values
    (p_account_id, v_from, p_to_stage, p_source, p_actor_profile, p_actor_api_key, p_note,
     coalesce(p_occurred_at, now()))
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gong reports, briefs, TAM requests, onboarding notes, audit log
-- ---------------------------------------------------------------------------
create table portal_gong_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references portal_accounts (id) on delete cascade,
  report_type portal_gong_report_type not null default 'call_notes',
  title text not null,
  content_md text not null,
  uploaded_by uuid references portal_profiles (id),
  created_at timestamptz not null default now()
);
create index portal_gong_reports_account_idx on portal_gong_reports (account_id, created_at desc);

create table portal_briefs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references portal_accounts (id) on delete cascade,
  status portal_brief_status not null default 'queued',
  generator portal_brief_generator,
  structured_json jsonb,
  pptx_storage_path text,
  error text,
  source_report_ids uuid[] not null default '{}',
  created_by uuid references portal_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portal_briefs_account_idx on portal_briefs (account_id, created_at desc);
create trigger portal_briefs_touch before update on portal_briefs
  for each row execute function portal_touch_updated_at();

create table portal_tam_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references portal_accounts (id) on delete cascade,
  requested_by uuid references portal_profiles (id),
  requester_email text not null,
  justification text not null,
  urgency text not null default 'medium' check (urgency in ('low','medium','high')),
  status portal_tam_status not null default 'pending',
  token_jti uuid not null default gen_random_uuid(),
  decided_at timestamptz,
  decided_by uuid references portal_profiles (id),
  decided_via text check (decided_via in ('email','portal')),
  decision_note text,
  created_at timestamptz not null default now()
);
create index portal_tam_requests_pending_idx on portal_tam_requests (status)
  where status = 'pending';

create table portal_onboarding_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references portal_accounts (id) on delete cascade,
  author_id uuid references portal_profiles (id),
  body_md text not null,
  review_status portal_note_review_status not null default 'needs_review',
  reviewed_by uuid references portal_profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index portal_onboarding_notes_account_idx
  on portal_onboarding_notes (account_id, created_at desc);
create index portal_onboarding_notes_review_idx on portal_onboarding_notes (account_id)
  where review_status = 'needs_review';

create table portal_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('user','api_key','email_token','system')),
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index portal_audit_log_entity_idx
  on portal_audit_log (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
create or replace function portal_is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from portal_profiles where id = auth.uid() and role = 'admin'
  );
$$;

create trigger portal_profiles_role_guard before update on portal_profiles
  for each row execute function portal_guard_role_change();

alter table portal_app_config enable row level security;
alter table portal_profiles enable row level security;
alter table portal_accounts enable row level security;
alter table portal_stage_transitions enable row level security;
alter table portal_gong_reports enable row level security;
alter table portal_briefs enable row level security;
alter table portal_tam_requests enable row level security;
alter table portal_onboarding_notes enable row level security;
alter table portal_api_keys enable row level security;
alter table portal_audit_log enable row level security;

create policy "config readable" on portal_app_config
  for select to authenticated using (true);
create policy "config admin write" on portal_app_config
  for update to authenticated using (portal_is_admin()) with check (portal_is_admin());

create policy "profiles readable" on portal_profiles
  for select to authenticated using (true);
create policy "profiles self or admin update" on portal_profiles
  for update to authenticated
  using (id = auth.uid() or portal_is_admin())
  with check (id = auth.uid() or portal_is_admin());

create policy "accounts readable" on portal_accounts
  for select to authenticated using (true);
create policy "accounts insert" on portal_accounts
  for insert to authenticated with check (true);
create policy "accounts update" on portal_accounts
  for update to authenticated using (true) with check (true);
create policy "accounts admin delete" on portal_accounts
  for delete to authenticated using (portal_is_admin());

-- History is readable but only writable via the definer function/service role.
create policy "transitions readable" on portal_stage_transitions
  for select to authenticated using (true);

create policy "gong readable" on portal_gong_reports
  for select to authenticated using (true);
create policy "gong insert" on portal_gong_reports
  for insert to authenticated with check (uploaded_by = auth.uid());
create policy "gong delete own or admin" on portal_gong_reports
  for delete to authenticated using (uploaded_by = auth.uid() or portal_is_admin());

create policy "briefs readable" on portal_briefs
  for select to authenticated using (true);
create policy "briefs admin delete" on portal_briefs
  for delete to authenticated using (portal_is_admin());

create policy "tam readable" on portal_tam_requests
  for select to authenticated using (true);
create policy "tam insert own" on portal_tam_requests
  for insert to authenticated with check (requested_by = auth.uid());
create policy "tam admin decide" on portal_tam_requests
  for update to authenticated using (portal_is_admin()) with check (portal_is_admin());

create policy "notes readable" on portal_onboarding_notes
  for select to authenticated using (true);
create policy "notes insert own" on portal_onboarding_notes
  for insert to authenticated with check (author_id = auth.uid());
create policy "notes update" on portal_onboarding_notes
  for update to authenticated using (true) with check (true);
create policy "notes delete own or admin" on portal_onboarding_notes
  for delete to authenticated using (author_id = auth.uid() or portal_is_admin());

create policy "api keys admin only" on portal_api_keys
  for select to authenticated using (portal_is_admin());

create policy "audit admin read" on portal_audit_log
  for select to authenticated using (portal_is_admin());

-- ---------------------------------------------------------------------------
-- Storage buckets (private; server signs URLs for every download)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('portal-briefs', 'portal-briefs', false),
       ('portal-uploads', 'portal-uploads', false)
on conflict (id) do nothing;
