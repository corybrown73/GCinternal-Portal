-- Postgres cannot drop a value from an enum. The values stay; 0072's down
-- moves every account back to in_onboarding and removes the pipeline rows,
-- after which no account can be moved into them.
select 1;
