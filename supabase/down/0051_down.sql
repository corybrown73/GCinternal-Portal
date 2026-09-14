alter table portal_profiles
  drop column if exists bio,
  drop column if exists photo_path,
  drop column if exists booking_url,
  drop column if exists title;
