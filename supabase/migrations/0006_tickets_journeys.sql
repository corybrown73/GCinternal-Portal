-- 0006 — Support tickets (with SLA + routing), alerts, and the journey engine.

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create table tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  customer_id uuid references customers (id) on delete cascade,
  implementation_id uuid references implementations (id) on delete set null,
  submitted_by uuid references portal_profiles (id),
  submitter_email text,
  category text not null check (category in ('technical','training','billing','data','integration','other')),
  subject text not null,
  body text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_customer','resolved','closed')),
  assigned_role text,
  assigned_to uuid references portal_profiles (id),
  sla_due_at timestamptz not null,
  sla_warned_at timestamptz,
  first_response_at timestamptz,
  sla_breached boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger tickets_touch before update on tickets
  for each row execute function portal_touch_updated_at();
create index tickets_open_status_idx on tickets (status)
  where status in ('open','in_progress');
create index tickets_customer_idx on tickets (customer_id);
create index tickets_assigned_to_idx on tickets (assigned_to);

create table ticket_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  ticket_id uuid not null references tickets (id) on delete cascade,
  author_id uuid references portal_profiles (id),
  author_email text,
  body text not null,
  internal boolean not null default false,
  created_at timestamptz default now()
);
create index ticket_comments_ticket_idx on ticket_comments (ticket_id, created_at);

create table ticket_routing (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  category text not null unique,
  route_role text not null,
  fallback_profile_id uuid references portal_profiles (id),
  created_at timestamptz default now()
);
insert into ticket_routing (category, route_role, fallback_profile_id)
values
  ('technical',   'tam_se',         null),
  ('integration', 'tam_se',         null),
  ('training',    'implementation', null),
  ('data',        'implementation', null),
  ('billing',     'manager',        null),
  ('other',       'implementation', null);

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------
create table alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  kind text not null, -- e.g. 'sla_breach','stalled_implementation','overdue_milestone','external'
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  title text not null,
  detail text,
  customer_id uuid references customers (id) on delete cascade,
  implementation_id uuid references implementations (id) on delete cascade,
  source text not null default 'system',
  payload jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid references portal_profiles (id),
  notified_at timestamptz,
  created_at timestamptz default now()
);
create index alerts_kind_idx on alerts (kind, created_at desc);
create index alerts_unacked_idx on alerts (acknowledged_at)
  where acknowledged_at is null;

-- ---------------------------------------------------------------------------
-- Journey engine
-- ---------------------------------------------------------------------------
create table content_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  title text not null,
  kind text not null default 'video' check (kind in ('video','doc','link')),
  url text not null,
  description text,
  created_by uuid references portal_profiles (id),
  created_at timestamptz default now()
);

create table journeys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  name text not null,
  description text,
  trigger_event text not null default 'manual', -- also 'customer_created','stage_entered'
  active boolean not null default true,
  created_at timestamptz default now()
);

create table journey_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  journey_id uuid not null references journeys (id) on delete cascade,
  step_order int not null,
  title text not null,
  content_item_id uuid references content_items (id) on delete set null,
  email_subject text not null,
  email_body text not null, -- supports {{first_name}}, {{content_url}} placeholders
  advance_on text not null default 'viewed' check (advance_on in ('viewed','delay')),
  delay_hours int,
  unique (journey_id, step_order)
);

create table journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  journey_id uuid not null references journeys (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  contact_id uuid references customer_contacts (id) on delete set null,
  contact_email text not null,
  current_step int not null default 0,
  status text not null default 'active' check (status in ('active','completed','paused')),
  last_sent_at timestamptz,
  created_at timestamptz default now(),
  unique (journey_id, contact_email, customer_id)
);
create index journey_enrollments_journey_idx on journey_enrollments (journey_id);
create index journey_enrollments_customer_idx on journey_enrollments (customer_id);
create index journey_enrollments_status_idx on journey_enrollments (status);

create table engagement_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001' references orgs (id),
  enrollment_id uuid references journey_enrollments (id) on delete cascade,
  step_id uuid references journey_steps (id) on delete set null,
  contact_email text,
  event text not null check (event in ('sent','viewed','clicked')),
  created_at timestamptz default now(),
  payload jsonb
);
create index engagement_events_enrollment_idx on engagement_events (enrollment_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Internal-only tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ticket_routing','alerts','content_items','journeys','journey_steps',
    'journey_enrollments','engagement_events'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "%s internal select" on %I for select to authenticated using (portal_is_internal())', t, t);
    execute format(
      'create policy "%s internal insert" on %I for insert to authenticated with check (portal_is_internal())', t, t);
    execute format(
      'create policy "%s internal update" on %I for update to authenticated using (portal_is_internal()) with check (portal_is_internal())', t, t);
    execute format(
      'create policy "%s internal delete" on %I for delete to authenticated using (portal_is_internal())', t, t);
  end loop;
end $$;

-- tickets: internal full access; customers can see and open tickets for their
-- own customers.
alter table tickets enable row level security;
create policy "tickets internal select" on tickets
  for select to authenticated using (portal_is_internal());
create policy "tickets customer select" on tickets
  for select to authenticated
  using (exists (
    select 1 from customer_users cu
    where cu.profile_id = auth.uid() and cu.customer_id = tickets.customer_id
  ));
create policy "tickets internal insert" on tickets
  for insert to authenticated with check (portal_is_internal());
create policy "tickets customer insert" on tickets
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from customer_users cu
      where cu.profile_id = auth.uid() and cu.customer_id = tickets.customer_id
    )
  );
create policy "tickets internal update" on tickets
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
create policy "tickets internal delete" on tickets
  for delete to authenticated using (portal_is_internal());

-- ticket_comments: internal full access; customers see non-internal comments
-- on their tickets and can add non-internal comments to them.
alter table ticket_comments enable row level security;
create policy "ticket_comments internal select" on ticket_comments
  for select to authenticated using (portal_is_internal());
create policy "ticket_comments customer select" on ticket_comments
  for select to authenticated
  using (
    internal = false
    and exists (
      select 1
      from tickets t
      join customer_users cu on cu.customer_id = t.customer_id
      where t.id = ticket_comments.ticket_id and cu.profile_id = auth.uid()
    )
  );
create policy "ticket_comments internal insert" on ticket_comments
  for insert to authenticated with check (portal_is_internal());
create policy "ticket_comments customer insert" on ticket_comments
  for insert to authenticated
  with check (
    internal = false
    and author_id = auth.uid()
    and exists (
      select 1
      from tickets t
      join customer_users cu on cu.customer_id = t.customer_id
      where t.id = ticket_comments.ticket_id and cu.profile_id = auth.uid()
    )
  );
create policy "ticket_comments internal update" on ticket_comments
  for update to authenticated
  using (portal_is_internal()) with check (portal_is_internal());
create policy "ticket_comments internal delete" on ticket_comments
  for delete to authenticated using (portal_is_internal());
