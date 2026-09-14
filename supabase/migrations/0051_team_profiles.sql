-- 0051 — a face and a calendar for every implementation person
--
-- WHAT THIS IS FOR. When a deal is assigned to Cory, the customer's welcome
-- page should show Cory: his photo on the team screen, his title, and a
-- "book time with Cory" link that goes to whatever scheduling tool the team
-- uses. Those are facts about a login, so they live on portal_profiles.
-- The photo is an object in the private attachments bucket, signed at view
-- time like every other picture this app shows.

alter table portal_profiles
  add column if not exists title text
    check (title is null or length(title) <= 80),
  add column if not exists booking_url text
    check (booking_url is null or booking_url ~* '^https://[^ ]+$'),
  add column if not exists photo_path text,
  add column if not exists bio text
    check (bio is null or length(bio) <= 400);

comment on column portal_profiles.title is 'How the customer sees the role: "Implementation Specialist".';
comment on column portal_profiles.booking_url is 'A scheduling link (https only). Shown to customers as "book time with …".';
comment on column portal_profiles.photo_path is 'Object path in the attachments bucket; signed when shown.';
comment on column portal_profiles.bio is 'One or two lines, in the first person, for the team screen.';
