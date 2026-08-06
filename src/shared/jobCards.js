// Repair job cards — shared between the POS console and the customer link.
//
// Handsets are booked in over the counter, usually without the owner present,
// so acceptance happens on the customer's own phone: staff send a WhatsApp
// link, the customer reads the same terms printed on the pad, signs on screen,
// and gets a PDF.
//
// The link token is the only credential, so `job_cards` is not readable through
// the API at all. Everything a guest can do goes through three SECURITY DEFINER
// functions keyed on the token, which return a fixed projection that omits
// `pattern_pin`, `notes` and the stored signature — a WhatsApp message gets
// forwarded, and a payload carrying the unlock pattern would hand over the
// means to open the handset.

import { getSupabaseClient } from './supabaseClient.js';

export const STORE = {
  name: 'JR Importers',
  address: 'Pelican Mall, Walvis Bay',
  phone: '+264 81 562 9203',
  email: 'JR.Importers@iway.na',
};

export const JOB_CARD_STATUSES = [
  'Awaiting acceptance',
  'Received',
  'Awaiting quote approval',
  'Approved — in repair',
  'Quote declined',
  'Ready for collection',
  'Collected',
  'Returned unrepaired',
];

export const STATUS_TONE = {
  'Awaiting acceptance': 'warn',
  Received: 'info',
  'Awaiting quote approval': 'warn',
  'Approved — in repair': 'info',
  'Quote declined': 'danger',
  'Ready for collection': 'good',
  Collected: 'good',
  'Returned unrepaired': 'muted',
};

// The bench checklist printed down the right-hand side of the card.
export const CHECKS = [
  { key: 'lcd', label: 'LCD' },
  { key: 'touch', label: 'Touch' },
  { key: 'ringer', label: 'Ringer' },
  { key: 'volume', label: 'Volume' },
  { key: 'power', label: 'Power' },
  { key: 'charge', label: 'Charge' },
  { key: 'ear_speaker', label: 'Ear spk.' },
  { key: 'mic', label: 'Mic' },
  { key: 'cameras', label: 'Cameras' },
  { key: 'signed', label: 'Signed' },
];

export const HANDLING_FEE = 200;

// Repairs above this must be confirmed with the customer before work starts.
export const QUOTE_THRESHOLD = 350;

// Reproduced verbatim from the printed pad. The customer must see exactly what
// they would have signed at the counter, so these are never paraphrased.
export const TERMS = [
  'A minimum handling fee of N$200 is payable / NON REFUNDABLE.',
  'Whilst all due care is exercised while handsets are in our possession, all handsets handed in for repairs are handed in at the customer’s risk.',
  'All outstanding amounts must be settled prior to release of handset.',
  'All repairs must be collected within 90 days, or the phone will be sold to defray repair costs.',
  'No warranty on any liquid or physical damage repairs.',
  'No phone will be collected without a job card present.',
  'Sim / Memory Cards handed in will be for the risk of the owner.',
  'Any parts that has been replaced will carry a 30 day warranty. KEEP INVOICE. No warranty on software.',
  'Repairs that will cost more than N$ 350-00 will first be confirmed with the customer prior to any repairs being carried out. Repairs costing less than N$ 350-00 will be carried out without prior confirmation sought from the customer.',
  'If found that any software/programmes has been downloaded, the warranty is automatically voided.',
];

export const MEMORY_WARNING =
  'WE DO NOT TAKE RESPONSIBILITY FOR ANY MEMORY LOSS ON A PHONE / MEMORY CARD OR SIM CARD.';

export const CONSENT = 'I HEREBY AGREE THAT I HAVE READ AND UNDERSTOOD THE TERMS AND CONDITIONS.';

/* ------------------------------------------------------------------ staff */

export async function listJobCards({ search = '', status = '' } = {}) {
  const db = getSupabaseClient();
  let q = db.from('job_cards').select('*');

  if (status) q = q.eq('status', status);

  const term = String(search || '').trim().replace(/[,()]/g, ' ').trim();
  if (term) {
    const parts = ['customer_name', 'customer_phone', 'imei', 'handset_type', 'fault'].map(
      (c) => `${c}.ilike.%${term}%`,
    );
    // A bare number is almost always someone reading a card number aloud.
    if (/^\d+$/.test(term)) parts.push(`job_number.eq.${term}`);
    q = q.or(parts.join(','));
  }

  const { data, error } = await q.order('job_number', { ascending: false }).limit(500);
  if (error) throw error;
  return data || [];
}

export async function saveJobCard(id, values) {
  const db = getSupabaseClient();
  const query = id
    ? db.from('job_cards').update(values).eq('id', id)
    : db.from('job_cards').insert(values);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteJobCard(id) {
  const db = getSupabaseClient();
  const { error } = await db.from('job_cards').delete().eq('id', id);
  if (error) throw error;
}

export async function sendQuote(id, amount, note) {
  return saveJobCard(id, {
    quote_amount: Number(amount) || 0,
    quote_note: note || null,
    quote_sent_at: new Date().toISOString(),
    quote_responded_at: null,
    quote_approved: null,
    status: 'Awaiting quote approval',
  });
}

/* ------------------------------------------------------------------ guest */

export async function fetchJobCardByToken(token) {
  const db = getSupabaseClient();
  const { data, error } = await db.rpc('get_job_card', { p_token: token });
  if (error) throw error;
  return data && data.found ? data.job_card : null;
}

export async function acceptJobCard(token, name, signature) {
  const db = getSupabaseClient();
  const { data, error } = await db.rpc('accept_job_card', {
    p_token: token,
    p_name: name,
    p_signature: signature,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
  if (!data || !data.ok) throw new Error((data && data.message) || 'Could not record your acceptance.');
  return data;
}

export async function respondToQuote(token, approved) {
  const db = getSupabaseClient();
  const { data, error } = await db.rpc('respond_job_card_quote', {
    p_token: token,
    p_approved: approved,
  });
  if (error) throw error;
  if (!data || !data.ok) throw new Error((data && data.message) || 'Could not record your response.');
  return data.job_card;
}

/* ------------------------------------------------------------------ links */

export function jobCardUrl(token) {
  return `${window.location.origin}/#/jobcard/${token}`;
}

// A wa.me deep link staff tap to send from their own WhatsApp. Needs no API
// credentials and works today; if a WhatsApp Business worker is configured
// later this stays as the manual fallback.
export function jobCardWhatsAppLink(card) {
  const phone = String(card.customer_phone || '').replace(/\D/g, '');
  const first = String(card.customer_name || '').trim().split(/\s+/)[0] || '';

  const message = [
    `Hi ${first}, thank you for choosing ${STORE.name}.`,
    '',
    `Job Card #${card.job_number}${card.handset_type ? ` — ${card.handset_type}` : ''}`,
    '',
    'Please open the link below to read our terms, sign, and receive your PDF job card:',
    jobCardUrl(card.accept_token),
    '',
    STORE.address,
    STORE.phone,
  ].join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function quoteWhatsAppLink(card) {
  const phone = String(card.customer_phone || '').replace(/\D/g, '');
  const first = String(card.customer_name || '').trim().split(/\s+/)[0] || '';

  const message = [
    `Hi ${first}, we have assessed your handset.`,
    '',
    `Job Card #${card.job_number}`,
    `Quoted repair cost: N$ ${Number(card.quote_amount || 0).toFixed(2)}`,
    '',
    'As per our terms, repairs above N$350 need your approval before we start.',
    'Please approve or decline here:',
    jobCardUrl(card.accept_token),
  ].join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
