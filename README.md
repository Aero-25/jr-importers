# JR Importers

Storefront and retail/POS console for a Namibian electronics importer, on
Supabase with a Cloudflare Worker for DPO payments.

- **Storefront** — catalogue, product pages, cart, checkout, customer accounts
- **Retail console** — POS terminal, orders, dispatch, stock, documents, ledger
- **Supabase** — 25 tables, RLS on every one, stock integrity enforced in SQL
- **PWA** — offline shell, installable; the console also ships as an Android APK
  via Capacitor (`mobile/`)

## Quick start

```bash
npm install
npm run dev          # storefront at /index.html, console at /admin.html
```

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server, both entries |
| `npm run build` | typecheck, then build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run gen:types` | regenerate `src/lib/database.types.ts` from the linked Supabase project |

## Configuration

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Build-time `VITE_*` values win; otherwise the app falls back to
`window.JR_CONFIG` in `app/public/config.js`. That fallback is deliberate — the
Android shell and the Cloudflare deploy swap that file to retarget an
environment without rebuilding.

The anon key is safe to commit; RLS is the real boundary. A service-role key is
not, and does not belong in this repository.

## Database

Migrations are in `supabase/migrations/`, applied in filename order.

**`20260806000000_stock_integrity_and_rls_hardening.sql` is not optional.** It
closes two policies that let any signed-in customer rewrite any product's stock
or mark any IMEI sold, and it adds the `reserve_order_stock` /
`release_order_stock` functions that checkout and the POS both depend on.
Without it, placing an order fails.

See [docs/MIGRATION.md](docs/MIGRATION.md) for the new-project checklist and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organised and
why.

## Layout

```
app/            Vite entries + static assets (config.js, icons, manifests, legal)
src/lib/        schema types, Supabase client, money/VAT/date formatting
src/ui/         design system shared by both apps
src/data/       React Query hooks, one module per domain
src/shop/       storefront
src/admin/      retail console
supabase/       migrations
mobile/         Capacitor Android shell for the console
_worker.js      Cloudflare Worker — DPO payment token creation and verification
```

## Deployment

`.github/workflows/deploy-pages.yml` installs, typechecks, builds and publishes
`dist/` on every push to `main`. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` as repository secrets.

## Note for local development on Windows

If this repository lives inside a OneDrive-synced folder, exclude `node_modules/`
and `dist/` from sync. A cold build otherwise takes upwards of fifteen minutes
against roughly ten seconds of real work.
