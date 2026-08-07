# Migrating off IQ Retail

The plan is a one-time move, not a sync. IQ stays running until the new system
is verified against it, then it is switched off. One source of truth at the end
of it, and nothing to maintain in between.

Two writers on one stock pool is the thing to avoid. If a handset sells in IQ
and again on the new till before anything reconciles, it has been sold twice —
and unpicking that is worse than any variance report.

---

## Confirmed setup

**IQ SaaS POS, Version 2023.1.0.0** — JR Importers Walvisbay.
Stock Maintenance holds **1,574 items**, against 43 in the new system.

Because it is the SaaS edition the database is hosted by IQ, so ODBC is not on
the table. The export route is the route, and it is enough.

---

## The stock export, field by field

In **Stock → Stock Maintenance**, click **Select Visible Fields** and tick
exactly these. Everything else can stay off — extra columns are harmless but
make the mapping screen longer to read.

| Tick | IQ field | Becomes | Note |
|---|---|---|---|
| ✓ | `CODE` | Stock code | The key everything matches on |
| ✓ | `DESCRIPT` | Description | |
| ✓ | `BARCODE` | Barcode | Lets the till scan it |
| ✓ | `DEPARTMENT` | Category | |
| ✓ | `AVRGCOST` | Cost price | **Average cost, not last cost** — it is what IQ values the shelf at |
| ✓ | `SELLPINC1` | Selling price | **The inclusive one.** See below |
| ✓ | `ONHAND` | Quantity on hand | The opening count |
| ✓ | `ORD_LVL` | Reorder level | Drives the low-stock alerts |
| ✓ | `SINGLE_SER` | — | Not imported, but tells us which lines IQ tracks by serial |
| ✓ | `ColourDesc` | Colour | Only if you use it |
| ✓ | `SUPPLIERCO` | — | Not imported yet; useful for checking |

### The one that matters most

Tick **`SELLPINC1`**, not `SELLPRICE1`.

`SELLPRICE1` is exclusive of VAT; `SELLPINC1` includes it. Prices are stored
and shown inclusive throughout this system — the shop says "VAT inclusive", and
the invoice works VAT backwards out of the total. Mapping the exclusive column
would understate every price by 15% and quietly wreck every margin figure.

`OnHandValue` is worth ticking too, purely to sanity-check: its total should
equal `ONHAND × AVRGCOST`.

### Then export

**Accept** → **Export** at the bottom of Stock Maintenance → **CSV**.

Do not open it in Excel and re-save. Excel rewrites number formats and strips
leading zeros off codes, and a stock code that loses its zeros stops matching
anything.

---

## Step 1 — Find out what you are running

**Product and version**

In IQ: **Help → About**. Write down the exact line, e.g.
`IQ Enterprise 2021 (7.00.00)`.

**Which database**

Open the IQ install folder — usually `C:\IQRetail\IQEnterprise\` or similar —
and look inside the company data directory:

| What you see | What it means |
|---|---|
| Files ending `.dat`, `.ddf`, `FILE.DDF`, `FIELD.DDF` | **Actian Zen / Pervasive PSQL**. CSV export is the dependable route; ODBC is possible with the Zen client. |
| No data files, and a SQL Server instance in Services | **Microsoft SQL Server**. Direct read is realistic. |

**Is the API available**

IQ Enterprise only. In IQ: **Utilities → Setup → Module Parameters** and look
for *IQ API* or *Web Services*. If it is there and licensed, say so — it is the
cleanest route by a distance.

---

## Step 2 — Export these, in this order

Every IQ grid exports the same way: open it, then **right-click → Export**, or
the **Export** button, and choose **CSV** (Excel is fine too — do not use PDF).

Export **all columns**, not the visible ones. There is usually a "select all
fields" option in the export dialog; use it. A column that looks useless in IQ
is often the one that links two files together.

| # | Where in IQ | What it becomes here | Why it matters |
|---|---|---|---|
| 1 | Stock → Stock Maintenance / Stock Master | Products | Codes, descriptions, cost, selling price, VAT flag |
| 2 | Stock → Stock Take / Stock on Hand | Opening quantities | **The real numbers.** Everything downstream depends on this |
| 3 | Debtors → Debtors Maintenance | Customers | Names, contacts, addresses, credit limits, balances |
| 4 | Creditors → Creditors Maintenance | Suppliers | Who you buy from |
| 5 | Stock → Reports → Sales History (12–24 months) | Sales history | Gives the reports something to say on day one |
| 6 | Debtors → Reports → Age Analysis | Debtors ageing | What is owed, and how old |
| 7 | Stock → Serial Number Tracking, if used | IMEIs | Only if you have been capturing serials in IQ |

**Naming.** Keep the IQ names, or prefix them plainly: `stock-master.csv`,
`stock-on-hand.csv`, `debtors.csv`, `creditors.csv`, `sales-history.csv`.

**Do not clean them up.** Not the headers, not the blank rows, not the odd
formatting. The importer is written against what IQ actually produces, and a
tidied file hides the shape of the real one.

---

## Step 3 — Send them over

Once the files exist, the importer gets written against them: column mapping,
duplicate handling, and a dry-run that reports what *would* land before
anything is written.

---

## Step 4 — Verify before switching anything off

Nothing gets trusted until these three agree with IQ, on the same day:

1. **Stock value at cost** — total, and by category
2. **Unit counts** on the twenty highest-value lines
3. **Debtors total**, and the ageing buckets

Then run both systems for a week with IQ still the master, comparing daily
takings. When a week passes with no disagreement, IQ comes off.

---

## What will not come across, and why

- **IQ's general ledger.** This system is a POS and stock system, not a full
  accounting package. Your accountant keeps whatever they use; the VAT return
  and the reports here feed it.
- **Historical documents** — old invoices, old GRVs as documents. The
  *transactions* come across; the printed originals stay in IQ. Keep a copy of
  the IQ data folder after switching off. Namibian record retention is five
  years.
- **IQ's own report layouts.** The equivalents here are rebuilt, not converted.

---

## Before you start

Take a full IQ backup, and confirm you can restore it. Exporting is read-only
and cannot hurt the data, but a migration is exactly when you want to find out
that the backup works — not afterwards.
