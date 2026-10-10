-- Reverses 0081: the claim indexes go; each run's own read still dedupes
-- sequential runs.
drop index if exists public.portal_audit_log_nudge_claim_uidx;
drop index if exists public.portal_audit_log_daily_report_uidx;
