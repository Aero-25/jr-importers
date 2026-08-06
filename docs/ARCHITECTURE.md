# JR Importers — Architecture

Two applications, one codebase, one Supabase database.

| Entry | Serves | Audience |
| --- | --- | --- |
| `app/index.html` → `dist/index.html` | Storefront | Customers |
| `app/admin.html` → `dist/admin.html` | Retail console (POS, stock, ledger) | Staff |

Both are built by a single Vite MPA build, so shared code — the UI kit, the
Supabase client, formatting, the typed schema — is compiled once and cached
across both.

---

## Why this replaced the previous build

The previous storefront and console were two hand-maintained HTML files:

| | Before | After |
| --- | --- | --- |
| `index.html` | 473 KB, 7,402 lines | 3.6 KB shell |
| `admin.html` | 849 KB, 11,523 lines | 3 KB shell |
| Largest component | `App` — 55 `useState` in one function | route modules |
| | `RetailManager` — 65 `useState` in one function | 20 focused modules |
| JSX | **Babel Standalone, in the browser, on every page load** | precompiled |
| CSS | `cdn.tailwindcss.com` (the dev-only JIT engine) | 6.5 KB gzip, built |
| Routing | `useState`; everything lived at one URL | real URLs |
| Types | none | 25 tables, fully typed |

The two lines that mattered most were these, present in both files:

```html
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
```

Every visitor downloaded a compiler and a CSS engine, then waited for 19,000
lines of JSX to be transpiled on their device before seeing a product. Both
tools document that they are not for production.

---

## Layout

```
app/                     Vite entries + static assets
  index.html             storefront shell (SEO tags, JSON-LD)
  admin.html             console shell (noindex)
  public/                config.js, icons, manifests, sw.js, legal pages

src/
  lib/                   framework-free foundation
    database.types.ts    typed schema for all 25 tables
    supabase.ts          the client, error unwrapping, friendly messages
    env.ts               VITE_* env, falling back to window.JR_CONFIG
    format.ts            money, VAT, dates — one source of truth
    constants.ts         domain vocabulary (statuses, categories, roles)
  ui/                    design system, shared by both apps
  auth/                  session + role resolution
  data/                  one module per domain; React Query throughout
  shop/                  storefront routes and components
  admin/                 console shell, nav, and modules
```

### The dependency rule

`lib` → `ui` → `data` → (`shop` | `admin`). Nothing lower imports from higher,
and `shop` and `admin` never import each other. That is what lets either app be
reasoned about, or rebuilt, without disturbing the other.

---

## Data layer

Everything goes through React Query. Retail data changes underneath you — another
till sells the last unit while you are looking at it — so `staleTime` is 30s and
refetch-on-focus is on. RLS failures are not retried; they will fail identically.

**`src/data/crud.ts`** exposes `createResource(table)`, which returns
`useList / useDetail / useCreate / useUpdate / useRemove` for any table. Thirteen
console modules are pure list-and-form over one table, so they are described as
data in `src/admin/modules/recordSpecs.ts` and rendered by a single component.
A fix to focus handling or error reporting lands in all thirteen at once.

Modules with real domain rules are hand-written instead, because a generic form
cannot express "release the stock" or "reconcile the drawer":

- `data/orders.ts` — placement, status transitions, coupon validation
- `data/pos.ts` — counter sales, till shifts, barcode lookup
- `data/products.ts` — catalogue filtering, facets, spec sheets
- `data/cart.ts` — client cart with cross-tab sync

### One known type compromise

supabase-js resolves result types through conditionals keyed on a *literal*
table name. Given a bare generic parameter those conditionals cannot reduce and
every call collapses to `never`. `crud.ts` therefore talks to an untyped client
handle internally and re-applies `Row<T>` at the boundary. Callers keep full
per-table types; the loose region is about six lines and is fenced by the
exported hook signatures.

Also note: the `Row` types are **type aliases, not interfaces**. Interfaces have
no implicit index signature, so they fail supabase-js's `Record<string, unknown>`
constraint and silently untype the whole client. Keep them as `type`.

---

## Stock integrity

`supabase/migrations/20260806000000_stock_integrity_and_rls_hardening.sql`.

The original schema carried two policies that let **any signed-in customer**
write to **any** product or IMEI row:

```sql
create policy "authenticated adjusts product stock" on public.products
for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated updates imeis" on public.product_imeis
for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

The `limit_customer_product_updates` trigger reverted every other column but
deliberately not `stock` — so a customer account could zero out the entire
inventory, or mark any IMEI sold. They existed because the old storefront
decremented stock from the browser at checkout.

Both are dropped. Checkout now calls `reserve_order_stock(order_id)`, a
`SECURITY DEFINER` function that:

1. verifies the caller owns the order (`owns_order`, not exposed to the API);
2. **sums quantities per product** — one product can appear on several lines,
   and checking each line separately would let an order over-promise stock;
3. locks each product row in ascending id order, so two orders sharing lines
   cannot deadlock;
4. checks availability against the IMEI pool for serialised products and against
   `stock` for everything else;
5. only then commits the decrements, writes `stock_movements`, and sets a
   30-minute hold.

`release_order_stock` is the inverse and is idempotent. `expire_stale_reservations`
sweeps abandoned checkouts; run it hourly from `pg_cron`, or from
**Settings → Housekeeping** in the console.

The POS uses the same function, so counter sales and web orders decrement stock
through exactly one code path.

---

## Configuration

Resolution order, first non-empty wins:

1. `VITE_*` build-time env (CI, local `.env`)
2. `window.JR_CONFIG` from `/config.js`

The second is kept deliberately: the Capacitor Android shell and the Cloudflare
deploy both swap that file to retarget an environment without a rebuild.

Only publishable values belong here. The Supabase anon key is safe to ship — RLS
is the real boundary — a service-role key never is.

---

## Deployment

`.github/workflows/deploy-pages.yml` installs, typechecks, builds, and publishes
**`dist/`**. The previous workflow used `path: .`, publishing the whole
repository including `node_modules` and the SQL migrations.

`_worker.js` (Cloudflare Worker for DPO payment tokens) and the Capacitor shell
in `mobile/` are unchanged and still work — the console is still one static HTML
file at `/admin.html`.

---

## Cutover

The new build is non-destructive. The legacy `index.html` and `admin.html` are
still at the repository root and still deployable. To cut over:

1. Point the host at `dist/` (the workflow in this branch already does).
2. Confirm the storefront, checkout, POS sale and till close against staging.
3. Apply the stock-integrity migration.
4. Delete the root `index.html` / `admin.html` and their duplicated static
   assets, which now live in `app/public/`.

Until step 4, `config.js`, `sw.js`, `icon.svg` and the legal pages exist twice —
at the root for the legacy site, and in `app/public/` for the new build. Keep
them in step, or finish the cutover.

---

## Local development

```bash
npm install
npm run dev        # storefront at /index.html, console at /admin.html
npm run typecheck
npm run build
```

If the repository lives in a OneDrive-synced folder, exclude `node_modules/` and
`dist/` from sync. Builds otherwise take upwards of fifteen minutes against
one second of actual work.
