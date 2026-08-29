-- Link the presale deal record to the post-sale customer created at closed won.
alter table portal_accounts
  add column if not exists customer_id uuid references customers (id) on delete set null;
create index if not exists portal_accounts_customer_idx on portal_accounts (customer_id);
