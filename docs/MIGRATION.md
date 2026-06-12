# JR Importers Supabase Migration

This repo now has a reproducible Supabase baseline in `supabase/migrations/20260612000000_initial_jr_importers_schema.sql`.

## New Project Checklist

1. Create or open the new Supabase project.
2. Apply the migration with the Supabase SQL editor or CLI.
3. Create the first admin auth user in Supabase Auth.
4. In SQL, promote that user:

```sql
update public.users
set role = 'admin', active = true
where lower(email) = lower('admin@example.com');
```

5. Upload logo/product assets to the public `Images` bucket, or keep `/icon.svg` for the app chrome.
6. Update `config.js` with the new project URL and anon key.
7. Re-test storefront sign-up, product loading, checkout order creation, admin login, POS sale, coupon validation, and IMEI assignment.

## Notes

- Auth users are mirrored into `public.customers` and `public.users` by the `handle_new_auth_user` trigger.
- Admin access is controlled by `public.is_admin()`, which checks `public.users.role`.
- The app uses client-side Supabase calls, so RLS policies are required for every table.
- The storefront and admin still depend on external services for EmailJS, DPO, and optional WhatsApp/SMS workers.
