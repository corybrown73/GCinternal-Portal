-- Reverses 0088: removes the closure columns, their guards and the closing function.
--
-- Dropping the columns destroys the only record that an implementation was
-- closed without graduating. So it refuses while any implementation is closed,
-- unless the operator has exported those rows and confirms with:
--   PGOPTIONS="-c down.implementation_closure_confirmed=1" psql "$DB_URL" -f 0088_down.sql

do $$
declare
  n integer;
  confirmed text := coalesce(current_setting('down.implementation_closure_confirmed', true), '');
begin
  select count(*) into n from implementations where closed_at is not null;
  if n > 0 and confirmed <> '1' then
    raise exception
      'Refusing to drop the closure of % implementation(s): export them first, then set down.implementation_closure_confirmed=1',
      n;
  end if;
end $$;

drop trigger if exists stage_history_closed_guard_trg on implementation_stage_history;
drop trigger if exists stage_instances_closed_guard_trg on stage_instances;
drop trigger if exists implementations_closed_guard_trg on implementations;

drop function if exists portal_closed_progression_guard();
drop function if exists portal_closed_implementation_guard();
drop function if exists portal_close_implementation(uuid, text, text, uuid);

drop index if exists implementations_open_customer_idx;

alter table implementations
  drop constraint if exists implementations_closure_shape_check,
  drop constraint if exists implementations_closure_reason_check;

alter table implementations
  drop column if exists closure_note,
  drop column if exists closure_reason,
  drop column if exists closed_by,
  drop column if exists closed_at;
