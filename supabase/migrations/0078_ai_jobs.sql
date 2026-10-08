-- 0078: the AI job queue and the persisted readings.
--
-- Every reading used to run inside one web request: brief, verifier, help
-- picker and SOW reader back to back, under a five-minute ceiling, with the
-- deal's `ai_reading` left "running" forever when the function was cut off.
-- A job row is worked one step per cron tick instead, so each step stays
-- well under the ceiling and a killed function is a retry, not a loss.
create table public.portal_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('prepare_deal', 'analyze_transcript')),
  deal_id uuid references public.portal_accounts (id) on delete cascade,
  implementation_id uuid references public.implementations (id) on delete cascade,
  subject_id uuid,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
  step text,
  steps_done jsonb not null default '[]'::jsonb,
  trigger text not null,
  requested_by uuid references public.portal_profiles (id) on delete set null,
  force boolean not null default false,
  rerun_requested boolean not null default false,
  source_hash text,
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_token text,
  result jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index portal_ai_jobs_due_idx on public.portal_ai_jobs (status, next_attempt_at);
create index portal_ai_jobs_deal_idx on public.portal_ai_jobs (deal_id, created_at desc);
-- One active job per deal and per subject: a second request while one is
-- queued or running sets `rerun_requested` on it instead of racing it.
create unique index portal_ai_jobs_active_deal_idx on public.portal_ai_jobs (kind, deal_id)
  where status in ('queued', 'running') and deal_id is not null;
create unique index portal_ai_jobs_active_subject_idx on public.portal_ai_jobs (kind, subject_id)
  where status in ('queued', 'running') and subject_id is not null;
create trigger portal_ai_jobs_touch before update on public.portal_ai_jobs
  for each row execute function portal_touch_updated_at();

-- The SOW extraction, kept: the same document (by its sha256) is never
-- sent to the model twice, and the plan panel, the implementation analysis
-- and the welcome page read the one reading.
create table public.portal_ai_readings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.portal_accounts (id) on delete cascade,
  kind text not null check (kind in ('sow')),
  source_path text,
  source_name text,
  source_hash text not null,
  model text,
  output jsonb not null,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index portal_ai_readings_source_idx
  on public.portal_ai_readings (deal_id, kind, source_hash);

-- Service role only, like 0063: the app reads and writes through the
-- service client, and nothing here is a customer-facing read.
alter table public.portal_ai_jobs enable row level security;
revoke all on table public.portal_ai_jobs from anon, authenticated;
alter table public.portal_ai_readings enable row level security;
revoke all on table public.portal_ai_readings from anon, authenticated;
