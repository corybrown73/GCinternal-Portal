-- 0055: where a deleted customer's rows go.
--
-- A super admin can delete a customer from the app now — dummy accounts, a
-- test that was left behind. Deleting is a cascade across thirty tables, so
-- before it runs the rows that matter are copied here as JSON, in one batch,
-- with who did it. Nothing in the app reads this table; it exists so a
-- deletion can be undone by hand from SQL rather than being final.
create table public.portal_deleted_archive (
  id bigserial primary key,
  batch uuid not null,
  kind text not null,
  row_id uuid,
  row jsonb not null,
  deleted_by uuid references public.portal_profiles (id) on delete set null,
  deleted_at timestamptz not null default now()
);
create index portal_deleted_archive_batch_idx on public.portal_deleted_archive (batch);

-- Service role only: RLS on with no policies means the REST API, signed in or
-- not, sees nothing. The app writes through the service-role client.
alter table public.portal_deleted_archive enable row level security;
revoke all on table public.portal_deleted_archive from anon, authenticated;
revoke all on sequence public.portal_deleted_archive_id_seq from anon, authenticated;
