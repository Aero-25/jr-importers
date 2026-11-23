// Emails the shop about a web order. Called by the database trigger
// `email_shop_about_web_order`, never by a browser: the caller must present
// the shared secret, and the Resend key stays in this function's environment.
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const expected = Deno.env.get('ORDER_MAIL_SECRET');
  if (!expected || req.headers.get('x-order-mail-secret') !== expected) {
    return new Response('Forbidden', { status: 403 });
  }

  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return new Response('RESEND_API_KEY not set', { status: 500 });

  const body = (await req.json()) as { subject?: string; html?: string; to?: string[]; cc?: string[]; from?: string };
  if (!body.subject || !body.html || !body.to?.length) return new Response('Bad request', { status: 400 });

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: body.from ?? Deno.env.get('EMAIL_FROM') ?? 'JR Importers <info@jrimporters.com>',
      to: body.to,
      cc: body.cc ?? [],
      subject: body.subject,
      html: body.html,
    }),
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
});
