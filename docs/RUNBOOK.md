# Runbook — JR Importers

Things that need doing by a person, and how to do them. Written for whoever is
holding the phone at the time, not for whoever wrote the system.

---

## 1. Test the restore  *(never done — do this first)*

Supabase takes daily backups. Nobody has ever restored one, so nobody knows how
long it takes or what is lost. A backup that has never been restored is a hope.

1. Supabase dashboard → **Database** → **Backups**. Note the newest backup's
   timestamp and confirm the schedule is running.
2. Create a **new, empty project** (`jr-restore-test`) in the same region.
3. Restore the newest backup into it. Time it. Write the number down.
4. In the restored project, run:
   ```sql
   select
     (select count(*) from orders)   as orders,
     (select count(*) from products) as products,
     (select count(*) from job_cards) as job_cards,
     (select max(created_at) from orders) as newest_order;
   ```
   Compare against production. **How far behind is `newest_order`?** That gap is
   how many hours of trading you would lose in a real failure.
5. Delete the test project.

**Decide from the result:** if losing that many hours of sales is unacceptable,
point-in-time recovery is a paid plan feature and is the fix. Repeat this test
every six months.

---

## 2. Rotate the exposed credentials  *(overdue)*

Both were shared in plain text and must be treated as compromised.

- **Supabase management token** — dashboard → Account → Access Tokens → revoke
  `sbp_f970…`, generate a new one, keep it out of the repository.
- **`info@jrimporters.com` password** — change it in the console under
  Staff & access, or via Supabase → Authentication → Users.

Nothing in the deployed site uses either. Only `config.js` values ship to
browsers, and those are publishable by design.

---

## 3. The opening stock take

The system believes **762 units** across 43 products, worth about
**N$2.65 m at cost**. That number has never been verified — your own till count
read 27 against 16 on the A55.

**Before you start, know this:** the first IMEI captured against a product
replaces that product's stock figure permanently. From then on, stock is the
count of available IMEIs.

So: **count a product completely, or not at all.** Capture every handset's IMEI
in one sitting per model. Use *Goods received* → scan each IMEI with the phone
camera. The posting screen shows before-and-after figures for anything that
switches to serial tracking.

Accessories have no IMEIs and keep ordinary quantities — correct those under
*Stock takes*.

---

## 4. When the till is offline

Nothing needs doing. Sales are saved on the device and post themselves when the
line returns; the banner at the top of the till says how many are waiting.

**Do not re-ring a sale** that shows as saved. The money is already in the
drawer and the sale is already recorded.

If the red *"could not be posted"* banner appears, the server is rejecting the
sale rather than being unreachable. Screenshot it. Those sales are still on that
device and that browser — do not clear the browser data.

---

## 5. Closing the month

1. Close every till shift.
2. Finance → **Period close** → set the dates → close.
3. Finance → **VAT return** for the period. It will confirm the period is
   locked. File that figure.

Once locked, orders, refunds, expenses and shifts in that period cannot be
edited by anyone. Mistakes get reversed with a refund or credit note, which is
the point. Reopening is possible but records who did it and why, permanently.

---

## 6. When something breaks

1. **Faults** in the console lists every error anyone hit, grouped, with the
   screen and the person. Check it before asking anyone what happened.
2. **Activity log** answers who changed what.
3. If the whole site is down, check the Cloudflare Pages dashboard for a failed
   deploy, then Supabase for project health.

---

## 7. Deploys

Pushing to `main` deploys automatically. GitHub Actions runs a type-check, a
build and five smoke tests first; a red run means the deploy should not be
trusted. Check the Actions tab before assuming a change is live.
