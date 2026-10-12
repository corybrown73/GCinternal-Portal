-- 0079: what the AI proposed from a meeting transcript, kept until a person
-- decides.
--
-- A transcript's proposals used to live in the browser tab that pressed
-- Analyse: a reload lost them, a colleague never saw them, and the reading
-- ran only when somebody waited for it. Each proposal is a row here from the
-- moment the model returns it, so the reading can run in the background, the
-- panel can list what is still to review, Home can count it, and Apply and
-- Dismiss leave a record of who decided what. Nothing in this table is the
-- implementation's truth: an applied row names the risk, issue, decision or
-- note that a person's click created.
create table public.evidence_proposals (
  id uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references public.implementations (id) on delete cascade,
  -- The evidence row the transcript was recorded as, when it was.
  evidence_id uuid references public.evidence (id) on delete cascade,
  -- The uploaded file the reading was made from.
  attachment_id uuid references public.account_files (id) on delete set null,
  job_id uuid references public.portal_ai_jobs (id) on delete set null,
  type text not null check (
    type in ('risk', 'issue', 'decision', 'target_date', 'owner', 'note', 'intake_suggestion')
  ),
  title text not null,
  text text not null default '',
  quote text,
  confidence text not null default 'uncertain'
    check (confidence in ('stated', 'implied', 'uncertain')),
  severity text,
  likelihood text,
  owner_team_member_id uuid references public.team_members (id) on delete set null,
  proposed_date date,
  -- An open record this looks like a repeat of; the row is shown unticked.
  duplicate_of_type text,
  duplicate_of_id uuid,
  -- For an intake_suggestion: the handoff question the text answers.
  intake_key text,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'dismissed')),
  applied_entity_type text,
  applied_entity_id uuid,
  decided_by uuid references public.portal_profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index evidence_proposals_impl_status_idx
  on public.evidence_proposals (implementation_id, status);
create index evidence_proposals_attachment_idx
  on public.evidence_proposals (attachment_id);
create trigger evidence_proposals_touch before update on public.evidence_proposals
  for each row execute function portal_touch_updated_at();

-- Service role only, like 0078: the app reads and writes through the
-- service client, and a proposal is never a customer-facing read.
alter table public.evidence_proposals enable row level security;
revoke all on table public.evidence_proposals from anon, authenticated;
