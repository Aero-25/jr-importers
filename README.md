# JR Importers

Static storefront, admin/POS dashboard, Cloudflare Worker payment endpoints, and Supabase schema for JR Importers.

## Important Files

- `index.html` - customer storefront.
- `admin.html` - retail manager/admin/POS interface.
- `_worker.js` - Cloudflare Worker endpoints for DPO token creation and verification.
- `config.js` - runtime Supabase and worker configuration.
- `supabase/migrations/` - database schema, functions, RLS policies, and storage bucket setup.
- `docs/MIGRATION.md` - new Supabase project migration checklist.

## Configure Supabase

Update `config.js` after creating the new Supabase project:

```js
window.JR_CONFIG = Object.freeze({
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: 'your-anon-key',
    LOGO_URL: '/icon.svg',
    AERO_LOGO_URL: '/icon.svg',
    SMS_WORKER_URL: '',
    WHATSAPP_WORKER_URL: ''
});
```

Apply the migration in `supabase/migrations/20260612000000_initial_jr_importers_schema.sql`, then promote the first admin user as shown in `docs/MIGRATION.md`.

## Local Preview

Because this is a static app, serve the folder from a local web server so `/config.js`, `/app-shell.js`, and the service worker resolve correctly.
