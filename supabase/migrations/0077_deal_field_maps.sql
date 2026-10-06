-- 0077: a third mapping direction, inbound_deal — Salesforce (or any sender)
-- field → the deal the closed-won endpoint creates. The existing inbound rows
-- feed /api/v1/implementations and target project columns; these rows feed
-- /api/v1/closed-won and target the deal, its people and its intake, so an
-- admin maps a custom Salesforce field (TIS_Assigned__r.Email, Industry__c)
-- in Admin → Integrations instead of asking for code.
alter table integration_field_maps drop constraint if exists integration_field_maps_direction_check;
alter table integration_field_maps
  add constraint integration_field_maps_direction_check
  check (direction in ('inbound', 'outbound', 'inbound_deal'));
