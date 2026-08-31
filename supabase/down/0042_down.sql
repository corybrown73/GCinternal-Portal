-- Reverse of 0042.
--
-- sales_owner (text) is untouched throughout, so dropping the reference loses
-- the link but never the answer to "who sold this" — which is the property the
-- pair was designed to have.
drop index if exists implementations_sales_owner_id_idx;
alter table implementations drop column if exists sales_owner_id;
alter table portal_accounts drop column if exists primary_contact_role;
alter table portal_accounts drop column if exists primary_contact_email;
alter table portal_accounts drop column if exists primary_contact_name;
alter table customers drop column if exists domain;
