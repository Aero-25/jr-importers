# Storefront redesign — three directions, nine screens each

Three complete redesigns of the customer storefront. Each direction is a
design *system* (tokens plus a component set), not a skin — every screen is
composed from the same components, so the three are directly comparable and
internally consistent.

## Published

- **Viewer** (works on phones) —
  <https://claude.ai/code/artifact/697df57e-5b05-4739-90b6-8cdede80824c>
- **Editable canvas** (desktop browser; 27 artboards on three pages) —
  <https://claude.ai/code/artifact/2ece181f-8f5f-4c7c-aecf-67ed62b0f506>

## Directions

| | Direction | Idea | Type | Tradeoff |
|---|---|---|---|---|
| A | Import Desk | Editorial trade catalogue: paper, hairlines, mono numerals | Bricolage Grotesque / IBM Plex Sans / IBM Plex Mono | Restrained — sells accuracy, not desire |
| B | Night Counter | Dark showroom: spotlight, one lime accent, one hero at a time | Syne / Manrope | Depends on real photography |
| C | Kiosk | Price-led poster commerce: 3px borders, hard shadows, huge prices | Archivo Black / DM Sans | Loud against the premium end |

## Screens

Home · Catalogue · Product · Cart · Checkout · Repairs booking · Account ·
Mobile (390×844 home + product) · Design-system sheet.

## Source

| File | What it is |
|---|---|
| `catalog.py` | Real catalogue data from `supabase/seed.sql` + `seed_phones.sql`, and `money()` matching `src/lib/format.ts` |
| `system.py` | The three design systems: tokens plus header, footer, card, buttons, chips, badges, fields, spec tables, device art |
| `screens.py` | Every screen, written once and rendered by all three systems |
| `build.py` | Emits the 27 `.dc.html` artboards, `canvas.json`, and the standalone viewer page |

```bash
python3 build.py     # regenerates every artboard and the viewer
```

Both published pages are regenerated from these files — neither is edited
directly. Device images are drawn placeholders where product photography goes;
`108 handsets` and similar figures stand in for the live catalogue counts the
storefront already computes.
