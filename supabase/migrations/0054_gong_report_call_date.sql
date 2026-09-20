-- 0054: the day a call happened, on its notes.
--
-- Call notes were stamped only with created_at — the moment somebody pasted
-- them — so a call on the 18th read as the 20th, and the order of events on
-- a deal could not be reconstructed afterwards. Optional: notes pasted the
-- same day need nothing more.
alter table public.portal_gong_reports
  add column if not exists call_date date;

comment on column public.portal_gong_reports.call_date is
  'The day the call took place. Null means the same day the notes were added.';
