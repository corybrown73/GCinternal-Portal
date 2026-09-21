-- 0060: the help-article library, and who opened what.
--
-- The customer's page gets a "Get started on your own" screen: the help
-- centre articles for the features they said mattered on the calls. The
-- library is the public GoCanvas help centre (help.gocanvas.com), synced
-- from its API in production and seeded from a bundled index when the API
-- is out of reach. Every link the customer opens goes through /go on our
-- domain and lands a row here, so the deal shows what they tried.
create table public.portal_help_articles (
  article_id text primary key,
  title text not null,
  category text not null default 'General',
  tags text[] not null default '{}',
  url text not null,
  last_updated timestamptz,
  active boolean not null default true,
  synced_at timestamptz not null default now()
);
create index portal_help_articles_category_idx on public.portal_help_articles (category);

create table public.portal_help_clicks (
  id bigserial primary key,
  account_id uuid not null references public.portal_accounts (id) on delete cascade,
  article_id text not null,
  clicked_at timestamptz not null default now()
);
create index portal_help_clicks_account_idx on public.portal_help_clicks (account_id, clicked_at desc);

-- Service role only, both: the app reads and writes through the service
-- client; the customer's link never touches the REST API.
alter table public.portal_help_articles enable row level security;
alter table public.portal_help_clicks enable row level security;
revoke all on table public.portal_help_articles from anon, authenticated;
revoke all on table public.portal_help_clicks from anon, authenticated;
revoke all on sequence public.portal_help_clicks_id_seq from anon, authenticated;
