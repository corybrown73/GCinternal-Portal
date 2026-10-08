-- Reverses 0078: the job queue and the persisted readings go. Nothing else
-- references either table.
drop table if exists public.portal_ai_readings;
drop table if exists public.portal_ai_jobs;
