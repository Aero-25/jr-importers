# Coastline storefront

The storefront uses Manrope for reading and Archivo for display, porcelain surfaces, forest-green controls and coastal photography created for JR Importers. `src/storefront/coastline.css` owns the shop tokens and homepage; `shell.css` owns navigation, repairs and footer; `commerce.css` owns catalogue and product surfaces. Styles are scoped to the storefront, including portal tokens via `body:has(.coastline-shop)`.

The two generated editorial images live in `public/coastline-hero.webp` and `public/coastline-repair.webp`. They are illustrative brand artwork; product cards and galleries continue to use actual catalogue photos, prices and availability. Fonts are self-hosted in `public/fonts` with their SIL Open Font License files.

Motion uses the existing one-shot reveal and scroll-parallax hooks, a short hero arrival, a slow laybuy orbit and pointer/hover light. Reduced-motion preferences disable these effects. Touch layouts do not depend on hover.

Shopping, authentication, stock, payment and service-booking logic remain in the existing hooks and handlers. `tests/storefront-redesign.spec.ts` exercises the shopping journey against isolated fixtures and blocks outgoing writes. `tests/smoke.spec.ts` also checks the shop, console, job-card and reduced-motion entry points.
