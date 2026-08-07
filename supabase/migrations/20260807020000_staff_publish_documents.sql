-- Lets signed-in staff publish the documents they send to customers.
--
-- Writing to the Images bucket previously required is_admin(). Every account is
-- an admin today, so nothing was failing, but the moment a cashier account
-- exists the job card PDF and the cash-up PDF would stop being attached to
-- their WhatsApp messages — and they would fail quietly, since the send falls
-- back to a link rather than erroring.
--
-- The grant is deliberately narrow: authenticated only, the Images bucket only,
-- and only the two folders these documents live in. Product imagery stays
-- admin-only.

create policy "staff publish customer documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] in ('jobcards', 'cashups')
  );

-- upsert: a re-sent job card must overwrite the copy already published for that
-- token, or the customer would receive a stale PDF.
create policy "staff replace customer documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] in ('jobcards', 'cashups')
  )
  with check (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] in ('jobcards', 'cashups')
  );
