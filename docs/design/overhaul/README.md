# Storefront overhaul — three structurally different shops

The earlier `../shop-redesign/` round shared one component system across all
three "directions", so they came out as one layout in three palettes. This round
shares nothing but the catalogue data and an icon helper: each direction has its
own information architecture, typeface, palette and components, written
separately.

- **Viewer** — <https://claude.ai/code/artifact/870d0230-05c6-41f4-82df-b51d1dde862a>

## The lime

`#a3e635` is the brand and it carries through all three, used the way each
system can take it:

- **Terminal** — lime is the cursor, the active tab, every action and healthy
  stock. On the near-black ground it clears 13:1, so it carries type too. Amber
  steps back to mean low stock only; red is critical.
- **Coast** — a 5px lime rule closes the masthead, the one action per page is a
  lime button with deep ink on it, one plate in the edit is a lime field, and
  the colophon labels are lime on the Atlantic ground.
- **Ask** — lime is the primary button, the answer panel's tint, the selected
  chip and the "our pick" badge. Scores stay ink so they read.

Never lime type on a light ground — `src/styles/theme.css` puts it at about
1.5:1 there, so on sand and white it is a surface with ink on it, and a deep
lime (`#4d7c0f`) does any small accent type.

## The three

**01 · Stock Terminal** (`d1_terminal.py`) — the shop as the live inventory it
actually is. No hero, no cards, no photography: a dense sortable table of real
units, a filter rail, and the till feed running underneath. The product page is
a stock record with the IMEI pool on it. JetBrains Mono throughout, near-black
with amber/green/red reserved for state.
*Tradeoff: it asks the customer to read a table.*

**02 · Coast** (`d2_coast.py`) — a magazine that happens to sell phones. A
masthead instead of a nav bar, an edit instead of a grid, a contents page with
dotted leaders instead of a catalogue, a feature article instead of a product
page, and a reply coupon instead of a checkout. Bodoni Moda + Karla on sand.
*Tradeoff: lovely, and slow to shop.*

**03 · Ask** (`d3_ask.py`) — the shop as one question. It opens with "What do you
need it to do?", answers in plain language, and puts a shortlist in front of you
as comparable rows with four honest scores — including how often each handset
comes back to our own bench. Schibsted Grotesk, white, one electric accent.
*Tradeoff: the shop has to have an opinion and keep it current.*

## Screens

19 artboards: 6 for Terminal, 6 for Coast, 7 for Ask — each with its own home,
browse, product, checkout, mobile (390×844) and design-system sheet.

## Source

| File | What it is |
|---|---|
| `catalog.py` | Real catalogue data from `supabase/seed.sql` + `seed_phones.sql` |
| `kit.py` | The only shared code: data re-export, icon paths, the drawn handset |
| `d1_terminal.py`, `d2_coast.py`, `d3_ask.py` | One direction each, self-contained |
| `build.py` | Emits the artboards, `canvas.json` and the viewer page |

```bash
python3 build.py
```

Every screen was rendered in headless Chromium and checked before publishing.
