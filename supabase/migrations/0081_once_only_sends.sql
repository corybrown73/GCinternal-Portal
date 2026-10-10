-- 0081: two overlapping sweeps cannot both send the same email.
--
-- The hourly sweep and the morning report each checked the audit log for
-- what was already sent, then sent, then wrote the row. A second invocation
-- of the same schedule (a retried delivery, a manual run) that arrived
-- inside that window saw nothing and sent again. Both now write a claim row
-- BEFORE sending, and these indexes refuse the second claim; the app reads
-- the unique_violation as "someone else is sending this".
--
-- The morning report: one report.daily_sent row per day (entity_key is the
-- day). A run where no send went through deletes its own claim.
create unique index if not exists portal_audit_log_daily_report_uidx
  on public.portal_audit_log (entity_key)
  where action = 'report.daily_sent';

-- A deal nudge: one deal.nudge_claim per deal, nudge key and hour
-- (payload.claim = "<key>@<YYYY-MM-DDTHH>"), so a recipient whose send
-- failed is still tried again the next hour.
create unique index if not exists portal_audit_log_nudge_claim_uidx
  on public.portal_audit_log (entity_id, (payload ->> 'claim'))
  where action = 'deal.nudge_claim';
