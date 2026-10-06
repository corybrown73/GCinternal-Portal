-- Reverses 0077: the deal-side rows go (nothing else references them), then
-- the two-value constraint comes back.
delete from integration_field_maps where direction = 'inbound_deal';
alter table integration_field_maps drop constraint if exists integration_field_maps_direction_check;
alter table integration_field_maps
  add constraint integration_field_maps_direction_check
  check (direction in ('inbound', 'outbound'));
