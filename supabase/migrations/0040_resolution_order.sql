-- 0040 — a record cannot be resolved before it existed.
--
-- THE BUG. "Resolved on" was a free date field on risks, issues and
-- escalations with nothing behind it. A risk identified on 12 August could be
-- saved resolved on 3 August, and every screen would show it that way.
-- Nothing downstream objected: time-to-resolve came out negative and the row
-- still counted as closed, so the only evidence was a date a person had to
-- read carefully. Production held one such row when this was written.
--
-- The app now refuses the pair in two places (the zod schemas in
-- src/lib/delivery-input.ts, and guardResolutionOrder in src/lib/hub.server.ts
-- for the half the form cannot send). This is the third: the app layer is
-- where the message comes from, the database is where the guarantee lives.
--
-- WHY A TRIGGER AND NOT A CHECK CONSTRAINT. The comparison has to be made in
-- calendar days, not instants: `identified_at` is `now()` and "Resolved on" is
-- stored at UTC midnight, so a risk raised at 14:00 and closed the same
-- afternoon has a resolution instant six hours BEFORE its own identification.
-- Reducing both sides to a UTC day needs `at time zone`, which is STABLE
-- rather than IMMUTABLE, and Postgres will not accept it in a CHECK. A trigger
-- takes the same expression and, unlike a CHECK, can say which dates clashed.

-- ---------------------------------------------------------------------------
-- Repair first, guard second
-- ---------------------------------------------------------------------------
-- The trigger only fires on new writes, so an existing bad row would sit there
-- until somebody edited it and then refuse the edit — the guard would surface
-- as "you cannot save this", on a row the person did not break. So the
-- impossible half of each pair is cleared now.
--
-- Only `resolved_at` is cleared, never the row: the record of the risk is
-- real, the claim about when it stopped is not. A row with status 'open' and a
-- resolution date was already contradicting itself; this leaves the half that
-- can be true.
do $$
declare n int;
begin
  update risks set resolved_at = null
   where resolved_at is not null
     and (resolved_at at time zone 'UTC')::date < (identified_at at time zone 'UTC')::date;
  get diagnostics n = row_count;
  if n > 0 then raise notice 'cleared % impossible risk resolution date(s)', n; end if;

  update issues set resolved_at = null
   where resolved_at is not null
     and (resolved_at at time zone 'UTC')::date < (raised_at at time zone 'UTC')::date;
  get diagnostics n = row_count;
  if n > 0 then raise notice 'cleared % impossible issue resolution date(s)', n; end if;

  update escalations set resolved_at = null
   where resolved_at is not null
     and (resolved_at at time zone 'UTC')::date < (raised_at at time zone 'UTC')::date;
  get diagnostics n = row_count;
  if n > 0 then raise notice 'cleared % impossible escalation resolution date(s)', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
-- One function for three tables. The start column is named differently on each
-- for historical reasons; the rule is not, and duplicating it three times is
-- how two of the copies end up disagreeing later.
create or replace function enforce_resolution_order()
returns trigger
language plpgsql
as $$
declare
  v_started timestamptz;
  v_label   text;
begin
  if new.resolved_at is null then
    return new;
  end if;

  if tg_table_name = 'risks' then
    v_started := new.identified_at;
    v_label   := 'identified';
  else
    v_started := new.raised_at;
    v_label   := 'raised';
  end if;

  if v_started is null then
    return new;
  end if;

  -- Calendar days in UTC, matching the rule stated in src/lib/dates.ts: a
  -- date-only value is a calendar date and is compared in UTC, so that the
  -- number under a date and the date itself cannot disagree.
  if (new.resolved_at at time zone 'UTC')::date < (v_started at time zone 'UTC')::date then
    raise exception
      'This % was % on %, so it cannot be resolved on %.',
      substring(tg_table_name from 1 for length(tg_table_name) - 1),
      v_label,
      (v_started at time zone 'UTC')::date,
      (new.resolved_at at time zone 'UTC')::date
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function enforce_resolution_order() is
  'Refuses a resolution date earlier than the day the record was identified or raised. Compared as UTC calendar days, so a same-day resolution is allowed.';

drop trigger if exists risks_resolution_order on risks;
create trigger risks_resolution_order
  before insert or update of resolved_at, identified_at on risks
  for each row execute function enforce_resolution_order();

drop trigger if exists issues_resolution_order on issues;
create trigger issues_resolution_order
  before insert or update of resolved_at, raised_at on issues
  for each row execute function enforce_resolution_order();

drop trigger if exists escalations_resolution_order on escalations;
create trigger escalations_resolution_order
  before insert or update of resolved_at, raised_at on escalations
  for each row execute function enforce_resolution_order();
