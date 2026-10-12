-- Reverses 0080: the visit index goes; the sweep's own check still dedupes.
drop index if exists public.alerts_kind_subject_visit_uidx;
