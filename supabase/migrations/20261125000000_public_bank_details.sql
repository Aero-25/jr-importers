-- Customers paying by EFT need the shop's banking details on the order
-- confirmation page. Settings are admin-only; this opens up exactly the four
-- banking keys for reading, and nothing else in the table. Admins still edit
-- them in Settings, so a changed account shows on the site immediately.

drop policy if exists "public reads banking details" on public.settings;
create policy "public reads banking details" on public.settings
  for select to anon, authenticated
  using (key in ('bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch_code'));
