/**
 * Sends the weekly price list, one email per recipient.
 *
 * Fifty customers means fifty separate messages. Nobody appears in anybody
 * else's To or Cc field — a dealer price list reveals who else the shop sells
 * to, and one careless Cc hands a competitor the whole customer book.
 *
 * The queue lives in the database. `bulk_claim_delivery()` hands out one
 * address at a time under `for update skip locked`, so two workers cannot take
 * the same one, and `unique (distribution_id, email)` means re-running this
 * after a failure cannot send a second copy to somebody who already has one.
 *
 * Runs on the service role so it keeps going when the browser that started it
 * is closed, and so pg_cron can call it on a Monday with nobody logged in. The
 * caller is therefore checked before anything else: an administrator's token,
 * or the scheduler's shared secret.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const STAFF_ADMIN = ['admin', 'owner', 'manager'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

interface Claim {
  ok: boolean;
  done: boolean;
  delivery_id?: number;
  distribution_id?: number;
  email?: string;
  name?: string;
}

/** `{name}`, `{date}`, `{week}` and `{website}` in the subject and body. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, token: string) => values[token] ?? whole);
}

function htmlBody(text: string, weekLabel: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;line-height:1.55">${
      block.replace(/\n/g, '<br>').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    }</p>`)
    .join('');

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f9">
  <div style="max-width:620px;margin:0 auto;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#0d263f">
    <div style="background:#123354;border-radius:14px 14px 0 0;padding:22px 26px">
      <div style="font-size:21px;font-weight:700;letter-spacing:.5px;color:#fff">JR IMPORTERS</div>
      <div style="font-size:11px;letter-spacing:1.6px;color:#a3e635;margin-top:5px">SHOP TECH. SHOP SMART.</div>
    </div>
    <div style="background:#fff;padding:26px;border:1px solid #e3e8ef;border-top:0">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:#6e7a8f;margin-bottom:14px">
        Samsung price list &middot; ${weekLabel}
      </div>
      ${paragraphs}
      <div style="margin-top:22px;padding:14px 16px;background:#f2f9e6;border-left:3px solid #a3e635;font-size:13px">
        Handsets shaded <strong>green</strong> on the attached list are in stock today.
      </div>
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
    return json({ ok: false, message: 'Email is not configured — the Resend API key is not set.' }, 503);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const from = Deno.env.get('EMAIL_FROM') ?? 'JR Importers <info@jrimporters.com>';
  const cronSecret = Deno.env.get('BULK_CRON_SECRET');

  // Who is asking. Either the scheduler, with its shared secret, or a signed-in
  // administrator. Never an anonymous caller: this sends mail as the shop.
  const presented = req.headers.get('x-cron-secret');
  const isCron = Boolean(cronSecret && presented && presented === cronSecret);

  if (!isCron) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ ok: false, message: 'Sign in to send a price list.' }, 401);

    const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!who.ok) return json({ ok: false, message: 'Sign in to send a price list.' }, 401);
    const user = await who.json();

    const roleRes = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=role,active`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
    );
    const [profile] = roleRes.ok ? await roleRes.json() : [];
    if (!profile || profile.active === false || !STAFF_ADMIN.includes(String(profile.role))) {
      return json({ ok: false, message: 'Only an administrator can send a price list.' }, 403);
    }
  }

  let payload: {
    distribution_id?: number;
    attachment?: string;
    filename?: string;
    /** Where the approved PDF was stored, for a run with nobody logged in. */
    storage_path?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, message: 'Malformed request.' }, 400);
  }

  const distributionId = Number(payload.distribution_id);
  if (!Number.isFinite(distributionId)) {
    return json({ ok: false, message: 'Which distribution?' }, 400);
  }

  const rpc = async (name: string, body: unknown) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
    return res.json();
  };

  const rest = async (path: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  };

  // What to say, and which week it is for.
  const [distribution] = await rest(
    `bulk_distributions?id=eq.${distributionId}&select=subject,body,file_name,list_id`,
  );
  if (!distribution) return json({ ok: false, message: 'That distribution does not exist.' }, 404);

  const [list] = await rest(`bulk_price_lists?id=eq.${distribution.list_id}&select=week_start`);
  const weekStart: string = list?.week_start ?? new Date().toISOString().slice(0, 10);
  const weekLabel = new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  // The console sends the PDF with the request. The scheduler cannot — nobody
  // is logged in at eight on a Monday — so it names the copy stored when the
  // list was approved and this fetches it with the service key.
  let attachment = payload.attachment ?? null;
  if (!attachment && payload.storage_path) {
    const file = await fetch(
      `${supabaseUrl}/storage/v1/object/Images/${payload.storage_path}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!file.ok) {
      return json({
        ok: false,
        message: `The stored price list could not be read (${file.status}).`,
      }, 502);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    attachment = btoa(binary);
  }

  const filename = payload.filename?.endsWith('.pdf')
    ? payload.filename
    : `JR_Importers_Price_List_${weekStart}.pdf`;

  if (!attachment) {
    return json({
      ok: false,
      message: 'No price list to attach. Approve a list so its PDF is stored, or send it from the console.',
    }, 400);
  }

  let sent = 0;
  let failed = 0;

  // Drain the queue. The cap is a guard against a runaway loop, not a limit on
  // the mailing list: the function is re-entrant, so a larger list simply needs
  // another run, and nobody already written to is written to twice.
  for (let i = 0; i < 400; i += 1) {
    const claim = (await rpc('bulk_claim_delivery', {
      p_distribution_id: distributionId,
    })) as Claim;

    if (!claim || claim.done) break;

    const values = {
      name: claim.name?.trim() || 'there',
      date: weekLabel,
      week: weekLabel,
      website: 'www.jrimporters.com',
    };

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [claim.email],
          subject: fill(distribution.subject, values),
          text: fill(distribution.body, values),
          html: htmlBody(fill(distribution.body, values), weekLabel),
          attachments: [{ filename, content: attachment }],
        }),
      });

      if (res.ok) {
        sent += 1;
        await rpc('bulk_finish_delivery', { p_delivery_id: claim.delivery_id, p_sent: true });
      } else {
        failed += 1;
        const detail = (await res.text()).slice(0, 300);
        await rpc('bulk_finish_delivery', {
          p_delivery_id: claim.delivery_id,
          p_sent: false,
          p_error: `Resend ${res.status}: ${detail}`,
        });
      }
    } catch (error) {
      failed += 1;
      await rpc('bulk_finish_delivery', {
        p_delivery_id: claim.delivery_id,
        p_sent: false,
        p_error: String((error as Error)?.message ?? error).slice(0, 300),
      });
    }
  }

  return json({ ok: true, distribution_id: distributionId, sent, failed });
});
