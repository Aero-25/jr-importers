/*
  Let staff publish damage-claim files.

  Storage writes for non-admins were opened up for 'jobcards', 'cashups' and
  'invoices'. Damage reports were added afterwards and nothing extended the
  list, so two things quietly failed for exactly the cashier the original
  migration existed to unblock:

    - `uploadDamagePhoto` writes to 'damage/…', so attaching the evidence
      photographs to a claim was refused outright.
    - sending a report on WhatsApp publishes its PDF to the same folder.

  Damage reports are not admin-gated in the console — they sit under Repairs
  alongside job cards — so the person raising one is usually not an admin.
*/

drop policy if exists "staff publish customer documents" on storage.objects;
create policy "staff publish customer documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] in ('jobcards', 'cashups', 'invoices', 'damage')
  );

drop policy if exists "staff replace customer documents" on storage.objects;
create policy "staff replace customer documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] in ('jobcards', 'cashups', 'invoices', 'damage')
  )
  with check (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] in ('jobcards', 'cashups', 'invoices', 'damage')
  );
