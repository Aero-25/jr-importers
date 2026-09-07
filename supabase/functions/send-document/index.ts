/**
 * Sends a shop document by email, from the shop's own address.
 *
 * Everything used to go out as a `mailto:` link, which opens the cashier's own
 * mail client and sends from whatever personal address is signed in there. The
 * customer gets an invoice from a Gmail address, nothing is recorded, and the
 * PDF is a link rather than an attachment.
 *
 * This sends through Resend as info@jrimporters.com, with the PDF attached.
 *
 * The API key lives here as a secret and never reaches the browser: the anon
 * key ships inside the site's own config.js, so anything the client can read is
 * public. The caller must present a signed-in staff token, or this becomes an
 * open relay for sending mail as the shop.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

interface Payload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Base64 PDF, without the data: prefix. */
  attachment?: string;
  filename?: string;
  replyTo?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);

  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    return json({
      ok: false,
      message: 'Email is not configured yet — the Resend API key has not been set.',
    }, 503);
  }

  // Who is asking. A document can carry a customer's name, phone and what they
  // paid, so this must not answer to an anonymous caller.
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, message: 'Sign in to send documents.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!who.ok) return json({ ok: false, message: 'Sign in to send documents.' }, 401);
  const user = await who.json();

  // Staff only. The role lives on the users table, not in the JWT.
  const roleRes = await fetch(
    `${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=role,active`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  );
  const [profile] = roleRes.ok ? await roleRes.json() : [];
  const STAFF = ['admin', 'owner', 'manager', 'sales', 'cashier', 'staff'];
  if (!profile || profile.active === false || !STAFF.includes(String(profile.role))) {
    return json({ ok: false, message: 'Only staff can send documents.' }, 403);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, message: 'Malformed request.' }, 400);
  }

  const to = (payload.to ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json({ ok: false, message: 'That email address does not look right.' }, 400);
  }
  if (!payload.subject?.trim() || !payload.html?.trim()) {
    return json({ ok: false, message: 'Subject and body are required.' }, 400);
  }

  const from = Deno.env.get('EMAIL_FROM') ?? 'JR Importers <info@jrimporters.com>';

  // The shop keeps a copy of everything it sends. Nothing else records
  // outgoing mail, so without this there is no way to prove an invoice went
  // out, or to find what a customer was actually sent.
  const copyTo = Deno.env.get('EMAIL_BCC') ?? 'info@jrimporters.com';

  const body: Record<string, unknown> = {
    from,
    to: [to],
    subject: payload.subject,
    html: payload.html,
    reply_to: payload.replyTo ?? 'info@jrimporters.com',
  };
  // Skipped when the shop is the recipient, so it does not receive the same
  // message twice.
  if (copyTo && copyTo.toLowerCase() !== to.toLowerCase()) body.cc = [copyTo];
  if (payload.text?.trim()) body.text = payload.text;
  if (payload.attachment && payload.filename) {
    body.attachments = [{ filename: payload.filename, content: payload.attachment }];
  }

  const sent = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await sent.json().catch(() => ({}));
  if (!sent.ok) {
    // Resend's own wording is the useful part — an unverified domain or a
    // rejected address should reach whoever is standing at the counter.
    return json({
      ok: false,
      message: result?.message ?? `Resend refused the message (${sent.status}).`,
    }, 502);
  }

  return json({ ok: true, id: result?.id ?? null, to, from });
});
