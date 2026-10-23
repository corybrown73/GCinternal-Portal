-- Reverses 0090: restores the customer SELECT policy exactly as 0005/0019
-- left it. This re-opens the exposure 0090 closed (a customer login can read
-- `notes`, `is_skeptic` and `comms_preference` of their own company's
-- contacts); it exists so up -> down -> up works, not as a production step.
drop policy if exists "customer_contacts customer select" on public.customer_contacts;
create policy "customer_contacts customer select" on public.customer_contacts
  for select to authenticated
  using (exists (
    select 1 from public.customer_users cu
    where cu.profile_id = auth.uid() and cu.customer_id = customer_contacts.customer_id
  ));
