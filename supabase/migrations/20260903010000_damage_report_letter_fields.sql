/*
  The damage report is a letter to an insurer, not a form.

  The shop's existing report (Sanlam, Aug 2026) addresses the insurance
  company and a named handler, states what was assessed and why the handset
  cannot be repaired, recommends replacement, and is signed off by a member of
  staff over the shop's letterhead. These columns carry the parts of that
  letter that change between claims; the rest is fixed wording.
*/

alter table public.damage_reports
  add column if not exists insurer_name    text,
  add column if not exists insurer_contact text,
  add column if not exists insurer_phone   text,
  /* Who signs the letter. Not `created_by`: the person who types a claim at
     the counter is often not the technician who assessed the handset. */
  add column if not exists signed_by       text,
  /* Drives the "has been discontinued" line, which an assessor reads as the
     reason a like-for-like replacement is not possible. */
  add column if not exists discontinued    boolean not null default false,
  /* The assessment finding, e.g. "water damage" — distinct from `cause`,
     which is how it happened. */
  add column if not exists finding         text;

comment on column public.damage_reports.finding is
  'Why the device is beyond repair — the assessment conclusion quoted in the letter.';
comment on column public.damage_reports.description is
  'The damaged components, listed in the letter as what was found on assessment.';
