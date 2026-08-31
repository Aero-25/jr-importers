# Storefront redesign — three directions

Source for the design canvas at
<https://claude.ai/code/artifact/2ece181f-8f5f-4c7c-aecf-67ed62b0f506>.

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

The published canvas is regenerated from these files — it is not edited directly.
