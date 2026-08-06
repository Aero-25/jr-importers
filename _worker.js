// _worker.js - Cloudflare Worker for DPO Payment Gateway
// Hardened with safer CORS handling, request validation,
// and a small health endpoint for deploy checks.

const DEBUG = false;
const DPO_API_URL = 'https://secure.3gdirectpay.com/API/v6/';
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)?jrimporters\.com$/i,
  /^https:\/\/[a-z0-9-]+\.workers\.dev$/i,
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i
];

const debugLog = (...args) => {
  if (DEBUG) {
    globalThis.console.log(...args);
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      const originError = getOriginErrorResponse(request);
      if (originError) {
        return originError;
      }

      return new Response(null, {
        status: 204,
        headers: createCorsHeaders(request)
      });
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse(request, {
        status: 'ok',
        service: 'jr-importers-dpo-worker',
        checked_at: new Date().toISOString()
      });
    }

    if (url.pathname === '/api/dpo-create-token' && request.method === 'POST') {
      return handleCreateToken(request);
    }

    if (url.pathname === '/api/dpo-verify-token' && request.method === 'POST') {
      return handleVerifyToken(request);
    }

    return serveAsset(request, env);
  }
};

/**
 * Static assets, with an SPA fallback for the storefront.
 *
 * A `_worker.js` at the root puts Pages in advanced mode, where `_redirects`
 * and the automatic `404.html` handling are both bypassed — this worker owns
 * routing, and `env.ASSETS` simply 404s on anything without a matching file.
 *
 * The storefront uses history routing, so `/shop`, `/product/…` and the
 * `/jobcard/<token>` link customers open from WhatsApp have no file behind
 * them. Those must resolve to the storefront shell rather than 404.
 *
 * Only navigation requests are rewritten. A missing image or script must keep
 * returning 404, otherwise a typo'd asset URL silently returns HTML and the
 * failure surfaces much later as a confusing parse error.
 *
 * `/admin` is excluded: the console is its own document, and it uses hash
 * routing, so it never produces an unmatched path of its own.
 */
async function serveAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404) return response;

  const url = new URL(request.url);
  const wantsHtml = (request.headers.get('accept') || '').includes('text/html');
  const isAdmin = url.pathname === '/admin' || url.pathname.startsWith('/admin/');

  if (request.method !== 'GET' || !wantsHtml || isAdmin) return response;

  const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
  if (!shell.ok) return response;

  // 200, not a redirect: the browser keeps the deep link in the address bar
  // and the router reads it on boot.
  return new Response(shell.body, {
    status: 200,
    headers: shell.headers
  });
}

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function getAllowedOrigin(origin) {
  if (!origin) {
    return '*';
  }

  return isAllowedOrigin(origin) ? origin : null;
}

function createCorsHeaders(request, { contentType = 'application/json' } = {}) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = getAllowedOrigin(origin);
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  });

  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
  }

  return headers;
}

function jsonResponse(request, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: createCorsHeaders(request)
  });
}

function getOriginErrorResponse(request) {
  const origin = request.headers.get('Origin');
  if (!origin) {
    return null;
  }

  if (isAllowedOrigin(origin)) {
    return null;
  }

  return jsonResponse(request, { error: 'Origin not allowed' }, 403);
}

async function readJson(request) {
  try {
    return { data: await request.json() };
  } catch {
    return { error: 'Invalid JSON body' };
  }
}

function sanitizeText(value, maxLength = 255) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim().slice(0, maxLength);
}

function normalizeCurrency(value) {
  const currency = sanitizeText(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount.toFixed(2);
}

function normalizeServices(services) {
  if (!Array.isArray(services)) {
    return [];
  }

  return services
    .slice(0, 25)
    .map((service) => ({
      type: sanitizeText(service?.type, 32),
      description: sanitizeText(service?.description, 180),
      date: sanitizeText(service?.date, 40)
    }))
    .filter((service) => service.type || service.description || service.date);
}

// Helper function to escape XML special characters
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper function to extract XML tag value
function extractXmlValue(xml, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

async function callDpoApi(xmlPayload) {
  debugLog('Calling DPO API');

  const dpoResponse = await fetch(DPO_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xmlPayload
  });

  if (!dpoResponse.ok) {
    throw new Error(`DPO API returned status ${dpoResponse.status}`);
  }

  return dpoResponse.text();
}

// Create Token Handler
async function handleCreateToken(request) {
  try {
    const originError = getOriginErrorResponse(request);
    if (originError) {
      return originError;
    }

    const { data: body, error: parseError } = await readJson(request);
    if (parseError) {
      return jsonResponse(request, { error: parseError }, 400);
    }

    const companyToken = sanitizeText(body.companyToken, 120);
    const amount = normalizeAmount(body.amount);
    const currency = normalizeCurrency(body.currency);
    const services = normalizeServices(body.services);

    if (!companyToken || !amount || !currency) {
      return jsonResponse(request, {
        error: 'Missing or invalid required fields: companyToken, amount, currency'
      }, 400);
    }

    const dpoRequest = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
    <CompanyToken>${escapeXml(companyToken)}</CompanyToken>
    <Request>createToken</Request>
    <Transaction>
        <PaymentAmount>${escapeXml(amount)}</PaymentAmount>
        <PaymentCurrency>${escapeXml(currency)}</PaymentCurrency>
        <CompanyRef>${escapeXml(sanitizeText(body.companyRef, 100))}</CompanyRef>
        <RedirectURL>${escapeXml(sanitizeText(body.redirectURL, 500))}</RedirectURL>
        <BackURL>${escapeXml(sanitizeText(body.backURL, 500))}</BackURL>
        <CompanyRefUnique>0</CompanyRefUnique>
        <PTL>24</PTL>
        <customerEmail>${escapeXml(sanitizeText(body.customerEmail, 160))}</customerEmail>
        <customerFirstName>${escapeXml(sanitizeText(body.customerFirstName, 80))}</customerFirstName>
        <customerLastName>${escapeXml(sanitizeText(body.customerLastName, 80))}</customerLastName>
        <customerPhone>${escapeXml(sanitizeText(body.customerPhone, 40))}</customerPhone>
        <customerCity>${escapeXml(sanitizeText(body.customerCity, 80))}</customerCity>
        <customerCountry>${escapeXml(sanitizeText(body.customerCountry, 8))}</customerCountry>
    </Transaction>
    <Services>
        ${services.map((service) => `<Service>
            <ServiceType>${escapeXml(service.type)}</ServiceType>
            <ServiceDescription>${escapeXml(service.description)}</ServiceDescription>
            <ServiceDate>${escapeXml(service.date)}</ServiceDate>
        </Service>`).join('')}
    </Services>
</API3G>`;

    const responseText = await callDpoApi(dpoRequest);
    debugLog('DPO createToken response received');

    const result = {
      result: extractXmlValue(responseText, 'Result'),
      resultExplanation: extractXmlValue(responseText, 'ResultExplanation') || 'No explanation provided',
      transToken: extractXmlValue(responseText, 'TransToken'),
      transRef: extractXmlValue(responseText, 'TransRef')
    };

    if (!result.result) {
      return jsonResponse(request, {
        error: 'Failed to parse DPO response',
        rawResponse: responseText
      }, 502);
    }

    return jsonResponse(request, result);
  } catch (error) {
    console.error('Create Token Error:', error);

    return jsonResponse(request, {
      error: error.message || 'Unknown error'
    }, 500);
  }
}

// Verify Token Handler
async function handleVerifyToken(request) {
  try {
    const originError = getOriginErrorResponse(request);
    if (originError) {
      return originError;
    }

    const { data: body, error: parseError } = await readJson(request);
    if (parseError) {
      return jsonResponse(request, { error: parseError }, 400);
    }

    const companyToken = sanitizeText(body.companyToken, 120);
    const transactionToken = sanitizeText(body.transactionToken, 160);

    if (!companyToken || !transactionToken) {
      return jsonResponse(request, {
        error: 'Missing required fields: companyToken, transactionToken'
      }, 400);
    }

    const dpoRequest = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
    <CompanyToken>${escapeXml(companyToken)}</CompanyToken>
    <Request>verifyToken</Request>
    <TransactionToken>${escapeXml(transactionToken)}</TransactionToken>
</API3G>`;

    const responseText = await callDpoApi(dpoRequest);
    debugLog('DPO verifyToken response received');

    const result = {
      result: extractXmlValue(responseText, 'Result'),
      resultExplanation: extractXmlValue(responseText, 'ResultExplanation') || 'No explanation provided',
      transactionApproval: extractXmlValue(responseText, 'TransactionApproval'),
      transactionAmount: extractXmlValue(responseText, 'TransactionAmount'),
      transactionCurrency: extractXmlValue(responseText, 'TransactionCurrency')
    };

    if (!result.result) {
      return jsonResponse(request, {
        error: 'Failed to parse DPO response',
        rawResponse: responseText
      }, 502);
    }

    return jsonResponse(request, result);
  } catch (error) {
    console.error('Verify Token Error:', error);

    return jsonResponse(request, {
      error: error.message || 'Unknown error'
    }, 500);
  }
}
