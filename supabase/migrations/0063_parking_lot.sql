-- 0063: the parking lot.
--
-- The Implementation Playbook's live artifact: every request or idea that
-- comes up on a call but is not today's objective, with why it matters,
-- whether it is needed for launch, who owns it, when it will be handled and
-- where it stands. Reviewed at the end of every meeting and shown to the
-- customer on their page — "we are not saying no, we are deciding when".
create table public.portal_parking_lot (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.portal_accounts (id) on delete cascade,
  request text not null check (length(request) between 1 and 300),
  why text not null default '' check (length(why) <= 500),
  needed_for_launch boolean not null default false,
  owner text not null default 'gocanvas' check (owner in ('gocanvas', 'customer', 'both')),
  target text not null default '' check (length(target) <= 80),
  status text not null default 'open' check (status in ('open', 'scheduled', 'done', 'dropped')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portal_parking_lot_account_idx on public.portal_parking_lot (account_id, created_at);

-- Service role only: the app reads and writes through the service client,
-- and the customer's page reads it by its own token on the server.
alter table public.portal_parking_lot enable row level security;
revoke all on table public.portal_parking_lot from anon, authenticated;
