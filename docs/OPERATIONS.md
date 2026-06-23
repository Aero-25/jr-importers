# JR Importers — Operations & Setup

This document covers the live data setup, admin access, and the local QA tooling
added to bring the storefront and admin "command center" online.

## Live backend

- **Supabase project ref:** `xapwbymrlpphxanzokja`
- Runtime keys live in `config.js` (the anon/publishable key is safe to ship).
- The schema is in `supabase/migrations/`. The demo/production starter data is in
  **`supabase/seed.sql`** — a single idempotent script (safe to re-run; it clears its
  own seeded rows by `JR-` SKUs / seed tags and reinserts).

### Applying the seed

Either with the Supabase CLI:

```bash
supabase db execute --file supabase/seed.sql
```

…or by POSTing it to the Management API (`/v1/projects/<ref>/database/query`) with a
`SUPABASE_ACCESS_TOKEN`.

The seed provides: store settings, 3 hero banners, 24 products across 6 categories
(Smartphones, Laptops, Tablets, Audio, Wearables, Accessories) with full specs &
margins, 5 suppliers, 8 customers, 3 coupons, 6 expenses, and 9 orders spread over the
last month (mixed statuses). Order line items are enriched with each product's `id`,
`cost` and `sku` so the Sales / Profit reports compute accurate cost of sale and margin.

### IQ-Retail modules

`supabase/migrations/20260612030000_iq_retail_modules.sql` adds the tables behind the
full retail/accounting suite; `supabase/seed_iq_modules.sql` seeds demo data:

- **Quotes** (`quotes`) — build in the POS via *Save as Quote*, then convert to a sale
  (deducts stock, logs movements).
- **Layby** (`laybys`) — start in the POS via *Save as Layby* with a deposit; record
  instalments until the balance clears.
- **Debtors / Creditors** (`account_transactions`) — accounts receivable & payable
  ledgers with ageing buckets, statements, and receipt/payment capture.
- **Stock Takes** (`stock_takes`) — physical count → variance → applies stock
  adjustments and logs movements.
- **Stock Movements** — read-only audit trail over `stock_movements`.

`20260612040000_admin_creates_orders.sql` lets admins/staff create orders on behalf of
customers (POS sales with a selected customer, quote conversions) — the prior RLS policy
blocked this. All write paths were verified end-to-end via `.tooling/func.js`.

### Documents & ledger integration

- **Printable PDFs** (jsPDF + autotable): Quote, Invoice, Layby agreement, GRV, and
  account Statements — via `generateDocument()` / `printQuote` / `printLayby` /
  `printStatement` / `generateInvoice`. Verified generating real downloads.
- **Operations post to the ledgers automatically:** completing a **GRV** posts a
  creditor bill (A/P); creating an **invoice for a customer** posts a debtor charge
  (A/R) and marking it paid posts the receipt. Posts are idempotent (guarded by
  `doc_type` + `doc_id`). Fixed a latent bug where the invoice form matched customers
  with `parseInt` on a UUID (so every invoice showed "Cash Customer").

## Admin access

Admin status is granted by a row in `public.users` with `role` in
(`owner`, `admin`, `manager`) whose email matches the authenticated user
(see the `is_admin()` SQL function).

A working admin account has been provisioned:

- **Email:** `admin@jrimporters.com`
- **Role:** `owner`
- Password was set during provisioning and shared in the project handover.
  Change it from Supabase → Authentication, or reset via the Auth admin API.

To promote another existing auth user to admin, temporarily disable the guard trigger:

```sql
alter table public.users disable trigger protect_user_admin_fields;
update public.users set role = 'owner', active = true where email = '<their-email>';
alter table public.users enable trigger protect_user_admin_fields;
```

## Local QA tooling

`/.tooling` contains a Playwright harness (uses the system Chrome — no browser download)
that screenshots and smoke-tests both apps against the live backend. It is git-ignored.

```bash
# serve the static site
python -m http.server 8787 --bind 127.0.0.1

# from .tooling/
node shoot.js <tag>     # capture storefront + admin screenshots into ../.shots/<tag>
node verify.js          # click through every storefront flow + all 33 admin views,
                        # reporting any console/page errors per step (0 = healthy)
```

The last full run: **38 steps, 0 failures** (storefront load, product modal,
add-to-cart, admin login, and all 33 admin views render cleanly with real data).
