-- Postgres cannot drop a value from an enum. The value stays; 0057's down
-- removes the pipeline row, after which no account can be moved into it
-- (portal_transition_stage only accepts configured stages).
select 1;
