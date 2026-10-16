-- Reverses 0088. Drops only presenter-only selections: they are a personal
-- view over notes that stay where they are, and no note content is lost.
drop trigger if exists presenter_note_picks_guard on public.presenter_note_picks;
drop table if exists public.presenter_note_picks;
drop function if exists public.presenter_note_pick_guard();
