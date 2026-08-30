-- Reverse of 0040.
--
-- The triggers and the function come off cleanly. The data repair does not:
-- 0040 cleared resolution dates that preceded their own start date, and those
-- values are gone. That is deliberate and is stated here rather than hidden —
-- they were impossible dates, and restoring them would mean recording a
-- resolution that happened before the thing it resolved.
drop trigger if exists escalations_resolution_order on escalations;
drop trigger if exists issues_resolution_order on issues;
drop trigger if exists risks_resolution_order on risks;
drop function if exists enforce_resolution_order();
