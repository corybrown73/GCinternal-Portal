-- Presenter-only note selections: each signed-in internal user can pick existing
-- implementation notes for their own Presenter Workspace.
--
-- A pick is a reference, never a copy. Removing a pick deletes only this row.
-- Deleting the journal entry removes its picks; deleting the deal removes the
-- deal's picks; deleting the profile removes that person's picks. Deleting a
-- deal never touches its implementation or the notes on it (0041).
--
-- Nothing reads this table from a customer-facing path, and anon/authenticated
-- are revoked, so the only reader is the service role inside the app's own
-- server functions, which check the caller themselves.

create table if not exists public.presenter_note_picks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  profile_id uuid not null references public.portal_profiles (id) on delete cascade,
  deal_id uuid not null references public.portal_accounts (id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint presenter_note_picks_one_per_person unique (profile_id, deal_id, journal_entry_id)
);

create index if not exists presenter_note_picks_deal_idx on public.presenter_note_picks (deal_id);
create index if not exists presenter_note_picks_journal_idx on public.presenter_note_picks (journal_entry_id);

-- The database refuses a pick that the application should never write, so a
-- bug in a server function cannot widen what a presenter can see:
--   - the note must not be an exception record,
--   - the note must be on an implementation of the same deal,
--   - the signed-in person, the note, the implementation, the deal and the
--     pick itself must all sit in one organisation.
create or replace function public.presenter_note_pick_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entry public.journal_entries%rowtype;
  v_impl_org uuid;
  v_deal_org uuid;
  v_profile_org uuid;
begin
  select * into v_entry from public.journal_entries where id = new.journal_entry_id;
  if not found then
    raise exception 'presenter pick refused: the note does not exist';
  end if;

  if v_entry.kind in ('scope', 'customer', 'internal_delivery') then
    raise exception 'presenter pick refused: exception records cannot be selected';
  end if;

  select i.org_id into v_impl_org
  from public.implementations i
  where i.id = v_entry.implementation_id and i.deal_id = new.deal_id;
  if not found then
    raise exception 'presenter pick refused: the note is not on this deal''s implementation';
  end if;

  select a.org_id into v_deal_org from public.portal_accounts a where a.id = new.deal_id;
  select p.org_id into v_profile_org from public.portal_profiles p where p.id = new.profile_id;

  if new.org_id is distinct from v_entry.org_id
     or new.org_id is distinct from v_impl_org
     or new.org_id is distinct from v_deal_org
     or new.org_id is distinct from v_profile_org then
    raise exception 'presenter pick refused: organisation mismatch (selection %, note %, implementation %, deal %, person %)',
      new.org_id, v_entry.org_id, v_impl_org, v_deal_org, v_profile_org;
  end if;

  return new;
end;
$$;

drop trigger if exists presenter_note_picks_guard on public.presenter_note_picks;
create trigger presenter_note_picks_guard
  before insert or update on public.presenter_note_picks
  for each row execute function public.presenter_note_pick_guard();

alter table public.presenter_note_picks enable row level security;
revoke all on table public.presenter_note_picks from anon, authenticated;
