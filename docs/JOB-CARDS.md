# Job Cards

Digital replacement for the carbon-copy repair pad. The printed book runs to
**1351**, so the sequence starts at **1352** and carries on from there.

## Why the customer signs on their own phone

Handsets are usually booked in over the counter without the owner present, or
the owner leaves before the card is written up. Rather than chase a signature,
staff send a link over WhatsApp; the customer reads the same terms that are
printed on the pad, signs with a finger, and immediately gets a PDF.

```
Counter                     Customer's phone            Workshop
───────                     ────────────────            ────────
New job card → 1352
  ↓
Send via WhatsApp ────────► /jobcard/<token>
                             reads terms
                             types name, signs
                             taps Accept
                               ↓
                             PDF downloads    ────────►  status: Received
                                                         technician works
                                                           ↓
                             Approve N$450? ◄──────────  cost > N$350
                               ↓                          (terms, clause 9)
                             Approves        ────────►   Approved — in repair
```

## Security

The link token *is* the credential, so the table is not reachable through the
API at all:

- `job_cards` has RLS with a single `is_admin()` policy, and `anon` has **no**
  table privileges — a direct read returns `permission denied`.
- Guests reach exactly three `SECURITY DEFINER` functions, all keyed on the
  token: `get_job_card`, `accept_job_card`, `respond_job_card_quote`.
- Those functions return a fixed projection built by
  `private.job_card_public_payload`, which deliberately omits **`pattern_pin`**,
  **`notes`** and **`accepted_signature`**.

That last point matters: a WhatsApp message gets forwarded. If the guest payload
carried the unlock pattern, forwarding the link would hand over the means to
unlock the handset.

Acceptance is idempotent — a second submission returns the existing acceptance
rather than overwriting the signature already on file — and signatures are
capped at 400 KB so a leaked link cannot be used as free storage.

## Numbering

```sql
create sequence public.job_card_number_seq start with 1352;
```

If your physical pad has moved past 1351 before you go live, reset it **before
issuing the first card**:

```sql
select setval('public.job_card_number_seq', <last used number>, true);
```

## The N$350 rule

Clause 9 of the printed terms:

> Repairs that will cost more than N$ 350-00 will first be confirmed with the
> customer prior to any repairs being carried out.

The console surfaces **Send quote for approval** only once the cost exceeds
`JOB_CARD_QUOTE_THRESHOLD` (N$350). It reuses the same token, so the customer
opens the link they already have and sees an approve/decline panel above the
booking details.

## The pattern lock

Stored as hyphen-joined dot indices numbered left-to-right, top-to-bottom:

```
1 2 3
4 5 6      "1-2-5-8-9"  =  top-left → top-middle → centre → bottom-middle → bottom-right
7 8 9
```

Compact, readable on a printed card, and re-drawable — which a screenshot would
not be. The same field accepts a plain PIN or password; the console switches
between the grid and a text input based on the format.

## PDF

`src/lib/jobCardPdf.ts` renders a single A4 page laid out like the pad: header
block, customer and handset details on ruled lines, the pattern grid, the full
terms, the bordered **CHECKED BY TECHNICIAN** panel, and the three signature
rules along the bottom. jsPDF is imported dynamically — it is ~350 KB and would
otherwise sit in the main bundle for the benefit of very few page views.

The customer's copy is generated in their own browser from the signature they
just drew, so the stored signature never has to be sent back out.

## Files

| Path | Purpose |
| --- | --- |
| `supabase/migrations/20260806010000_job_cards.sql` | table, sequence, RPCs, RLS |
| `src/data/jobCards.ts` | hooks, WhatsApp links, guest RPC wrappers |
| `src/admin/modules/JobCards.tsx` | console module |
| `src/shop/routes/JobCardAccept.tsx` | the customer-facing link |
| `src/ui/PatternLock.tsx` | 3×3 grid capture and preview |
| `src/ui/SignaturePad.tsx` | canvas signature capture |
| `src/lib/jobCardPdf.ts` | PDF generation |
