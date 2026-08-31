# Storefront redesign — three directions

Published two ways:

- **Viewer** (works on phones) —
  <https://claude.ai/code/artifact/697df57e-5b05-4739-90b6-8cdede80824c>
  Built by `build-viewer.py`, which inlines the three artboards into one
  ~75 KB page with a fit-to-screen / actual-size toggle.
- **Editable canvas** (desktop browser) —
  <https://claude.ai/code/artifact/2ece181f-8f5f-4c7c-aecf-67ed62b0f506>
  The full canvas editor; ~2.5 MB, which is too heavy for the mobile viewer.

Each `.dc.html` is one full-page homepage mockup at 1440px, rendered as its own
artboard on the canvas; `canvas.json` places them and carries the notes.

| File                 | Direction         | Idea                                                                |
| -------------------- | ----------------- | ------------------------------------------------------------------- |
| `Main.dc.html`       | A · Import Desk   | Editorial trade catalogue — paper, hairlines, monospaced numbers.    |
| `DirectionB.dc.html` | B · Night Counter | Dark showroom — spotlit ground, one product hero'd at a time.        |
| `DirectionC.dc.html` | C · Kiosk         | Price-led poster commerce — hard borders, oversized prices.          |

All three run on real catalogue data (`supabase/seed.sql`, `supabase/seed_phones.sql`)
and the `money()` format from `src/lib/format.ts`. Device images are drawn
placeholders standing in for product photography; stat figures such as the
handset count stand in for the live catalogue query the current home page runs.

Both published pages are regenerated from these files — neither is edited directly.
