/**
 * Emails a quote a company asked for through its portal.
 *
 * The company gets it and info@jrimporters.com is copied, so the shop sees
 * every request as it goes out rather than finding it in a screen later.
 *
 * What it will not do is take the caller's word for anything. The quote number,
 * the lines and the total are read from the database by id; the request body
 * carries only the quote id and the rendered PDF. And the caller must be the
 * portal user of the company the quote belongs to — otherwise anybody with a
 * login could post somebody else's quote id and have their pricing emailed to
 * an address of their choosing.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SHOP_EMAIL = 'info@jrimporters.com';

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

const escape = (value: string) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const money = (value: number) =>
  `N$ ${Number(value).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface QuoteLine {
  name?: string;
  quantity?: number;
  price?: number;
  line_total?: number;
}

function quoteHtml(quote: {
  quote_number: string;
  customer_name: string;
  total_amount: number;
  valid_until: string | null;
  items: QuoteLine[];
}): string {
  const rows = quote.items
    .map(
      (line) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e3e8ef">${escape(line.name ?? '')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e3e8ef;text-align:center">${Number(line.quantity ?? 0)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e3e8ef;text-align:right">${money(Number(line.price ?? 0))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e3e8ef;text-align:right"><strong>${money(Number(line.line_total ?? 0))}</strong></td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f9">
  <div style="max-width:640px;margin:0 auto;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#0d263f">
    <div style="background:#123354;border-radius:14px 14px 0 0;padding:22px 26px">
      <div style="font-size:21px;font-weight:700;letter-spacing:.5px;color:#fff">JR IMPORTERS</div>
      <div style="font-size:11px;letter-spacing:1.6px;color:#a3e635;margin-top:5px">SHOP TECH. SHOP SMART.</div>
    </div>
    <div style="background:#fff;padding:26px;border:1px solid #e3e8ef;border-top:0">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:#6e7a8f">
        Quote ${escape(quote.quote_number)}
      </div>
      <p style="margin:14px 0 18px;line-height:1.55">
        Good day ${escape(quote.customer_name)},<br>
        Thank you for your request. Here is your quote.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#0d263f;color:#fff">
            <th style="padding:8px 10px;text-align:left">Item</th>
            <th style="padding:8px 10px;text-align:center">Qty</th>
            <th style="padding:8px 10px;text-align:right">Each</th>
            <th style="padding:8px 10px;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:12px 10px;text-align:right;font-weight:700">Total incl. VAT</td>
            <td style="padding:12px 10px;text-align:right;font-weight:700;font-size:15px">${money(Number(quote.total_amount))}</td>
          </tr>
        </tfoot>
      </table>

      ${quote.valid_until
        ? `<div style="margin-top:18px;padding:12px 14px;background:#f2f9e6;border-left:3px solid #a3e635;font-size:13px">
             Valid until ${escape(quote.valid_until)}. Prices are from this week's list and include 15% VAT.
           </div>`
        : ''}

      <p style="margin:20px 0 0;line-height:1.55;font-size:13px">
        To place the order, reply to this email or call us on +264 81 562 9203.
      </p>
    </div>
    <div style="background:#fff;border:1px solid #e3e8ef;border-top:0;border-radius:0 0 14px 14px;
                padding:16px 26px;font-size:11px;color:#6e7a8f">
      JR Importers &middot; Pelican Mall, Walvis Bay &middot; +264 81 562 9203 &middot;
      <a href="https://jrimporters.com" style="color:#123354">www.jrimporters.com</a>
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    return json({ ok: false, message: 'Email is not configured yet.' }, 503);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const from = Deno.env.get('EMAIL_FROM') ?? 'JR Importers <info@jrimporters.com>';

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, message: 'Sign in first.' }, 401);

  const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!who.ok) return json({ ok: false, message: 'Sign in first.' }, 401);
  const user = await who.json();

  let payload: { quote_id?: number; attachment?: string; filename?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, message: 'Malformed request.' }, 400);
  }

  const quoteId = Number(payload.quote_id);
  if (!Number.isFinite(quoteId)) return json({ ok: false, message: 'Which quote?' }, 400);

  const rest = async (path: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  };

  // The company this login belongs to, read as the shop rather than taken
  // from the request.
  const [link] = await rest(
    `company_portal_users?auth_user_id=eq.${user.id}&active=eq.true&select=customer_id`,
  );
  if (!link) return json({ ok: false, message: 'That login is not a company portal account.' }, 403);

  const [quote] = await rest(
    `quotes?id=eq.${quoteId}&select=id,quote_number,customer_id,customer_name,customer_email,items,total_amount,valid_until`,
  );
  if (!quote) return json({ ok: false, message: 'That quote does not exist.' }, 404);

  // The quote must belong to the company asking for it.
  if (quote.customer_id !== link.customer_id) {
    return json({ ok: false, message: 'That quote belongs to another account.' }, 403);
  }

  const to = String(quote.customer_email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return json({
      ok: false,
      message: 'There is no email address on this account — the shop will be in touch.',
    }, 400);
  }

  const attachments = payload.attachment
    ? [{ filename: payload.filename ?? `${quote.quote_number}.pdf`, content: payload.attachment }]
    : undefined;

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      // The shop sees every quote as it goes out.
      cc: [SHOP_EMAIL],
      reply_to: SHOP_EMAIL,
      subject: `JR Importers | Quote ${quote.quote_number}`,
      html: quoteHtml(quote),
      attachments,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return json({ ok: false, message: `The quote could not be emailed (${res.status}).`, detail }, 502);
  }

  return json({ ok: true, quote_number: quote.quote_number, to, cc: SHOP_EMAIL });
});
