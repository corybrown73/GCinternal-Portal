-- 0080: an alert keyed by a visit is raised once per visit.
--
-- The hourly sweep deduped its stall alerts against UNACKNOWLEDGED rows only,
-- so acknowledging "Stalled: X" invited the next run to raise it, and email
-- it, again; two overlapping cron invocations could also both insert. The
-- sweep now writes payload.visit ("<stage>@<stage_entered_at>" for a stall,
-- "<milestone>@<date>" for an overdue milestone, the ask or the target date
-- for a signal) and skips any alert, acknowledged or not, with the same
-- kind, subject and visit. This index makes that hold under concurrency; the
-- insert path reads a unique_violation as "already raised".
--
-- The subject is the implementation, else the deal named in the payload (a
-- closed deal can be stuck before its implementation exists). Partial: rows
-- without a visit (the audit-write failures, API alerts) are untouched.
create unique index if not exists alerts_kind_subject_visit_uidx
  on public.alerts (
    kind,
    (coalesce(implementation_id::text, payload ->> 'deal_id', '')),
    (payload ->> 'visit')
  )
  where payload ? 'visit';
