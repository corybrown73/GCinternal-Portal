-- 0047 — the form template library, and the deal's intake answers
--
-- TWO THINGS, ONE STEP, because they are one workflow. After a deal closes
-- the onboarding person asks the customer "do you already have forms built?"
-- If yes, they upload what exists. If no, they answer a few questions —
-- industry, how big, how many in the field, what the process is today — and
-- the system shows them starting points from a library of templates for
-- that industry. The library is the first table; the answers are the second
-- column.
--
-- WHY THE LIBRARY IS "JUST PHOTOS". A template here is a picture of a form
-- and the words to describe it, not a form definition. The point is that a
-- person who has never seen GoCanvas can look at a card and say "that one,
-- but with a signature block" — which is an entire discovery conversation
-- in one sentence. Real form definitions live in GoCanvas, where they can
-- be published; this is the catalogue the conversation starts from.
--
-- WHY intake IS jsonb AND NOT COLUMNS. The questions will change as soon as
-- somebody runs three real intakes, and a column per question means a
-- migration per change to a conversation. The shape is enforced in the app
-- (src/lib/intake-answers.ts); the database holds the answers as given.
-- The one thing the database does insist on is that it is an object.

create table form_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default '00000000-0000-4000-8000-000000000001',
  name text not null,
  industry text not null,
  description text,
  -- A path into the PRIVATE attachments bucket, signed on demand. Never a
  -- public URL, for the same reason as every other artefact in this app.
  image_path text,
  tags text[] not null default '{}',
  created_by uuid references portal_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A card with no name or no industry is a card nobody can find.
  constraint form_templates_name_not_blank check (length(btrim(name)) > 0),
  constraint form_templates_industry_not_blank check (length(btrim(industry)) > 0)
);

create index form_templates_industry_idx on form_templates (lower(industry));
create index form_templates_created_idx on form_templates (created_at desc);

-- RLS is defence in depth only, as on every other table: the app reads as
-- service_role. This stops a future anon-key path from listing the library.
alter table form_templates enable row level security;
create policy "form_templates internal" on form_templates
  for all using (portal_is_internal()) with check (portal_is_internal());

comment on table form_templates is
  'The form library: a picture of a form and the words to describe it, by industry. '
  'Starting points for the onboarding conversation, not form definitions.';

alter table portal_accounts add column if not exists intake jsonb;
alter table portal_accounts add constraint portal_accounts_intake_is_object
  check (intake is null or jsonb_typeof(intake) = 'object');

comment on column portal_accounts.intake is
  'The onboarding intake answers: whether forms are already built, what was '
  'uploaded, industry, size, field users, the process today. Shape is owned by '
  'src/lib/intake-answers.ts; the database only insists it is an object.';
