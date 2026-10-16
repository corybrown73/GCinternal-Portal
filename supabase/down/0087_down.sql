-- Reverses 0087. Refuses to destroy customer meeting records unless someone has
-- exported them and confirmed it, the same guard the other downs use.
--
-- A meeting record is human input: its kind, date and participants exist only
-- here. Confirmed rollbacks delete the customer_meeting rows, because the old
-- check cannot hold them. Notes are never reclassified as something they were
-- not.
do $$
declare
  n int;
begin
  select count(*) into n from public.journal_entries
   where kind = 'customer_meeting' or meeting_date is not null or participants is not null;
  if n > 0 and coalesce(current_setting('down.customer_meeting_export_confirmed', true), '') <> '1' then
    raise exception
      'Refusing to drop % customer meeting record(s): export them first, then set down.customer_meeting_export_confirmed=1', n;
  end if;
end $$;

delete from public.journal_entries where kind = 'customer_meeting';

alter table public.journal_entries drop constraint if exists journal_entries_kind_check;
alter table public.journal_entries
  add constraint journal_entries_kind_check
  check (kind in ('note', 'scope', 'customer', 'internal_delivery'));

alter table public.journal_entries
  drop column if exists meeting_date,
  drop column if exists participants;
