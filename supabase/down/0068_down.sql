-- Reverses 0068 as far as a data backfill can be: the history rows it wrote
-- are marked, so they can be found; the stages they set are not undone,
-- because the app keeps the journey inside the deal's band from here on.
-- select * from implementation_stage_history where notes = 'Mirrored from the deal (backfill 0068)';
select 1;
