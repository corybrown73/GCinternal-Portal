-- Down for 0018_handoff_gate.sql
--
-- handoff_events is the record of who accepted or returned a handoff and on
-- what basis — accountability evidence, and the only place a return that was
-- later resubmitted survives. It is archived rather than dropped.

do $$
declare
  n int;
begin
  select count(*) into n from handoff_events;
  if n > 0 then
    create schema if not exists v2_archive;
    execute 'create table if not exists v2_archive.handoff_events as table handoff_events';
    execute 'create table if not exists v2_archive.handoff_packets as table handoff_packets';
    raise notice 'archived % handoff event(s) to v2_archive before dropping', n;
  end if;
end $$;

drop table if exists handoff_events;
drop table if exists handoff_packets;

-- Kept deliberately: a contact marked as a skeptic, or with a stated comms
-- preference, is a recorded fact about a person that did not come from the
-- handoff gate and should not be erased by rolling it back.
-- To drop them anyway:
--   alter table customer_contacts drop column is_skeptic, drop column comms_preference;

update portal_app_config
   set value = value - 'handoff_gate'
 where key = 'v2_flags';
