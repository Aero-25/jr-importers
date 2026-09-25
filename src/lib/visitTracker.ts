import { config } from './env';
import { supabase } from './supabase';
import { isStaffDevice } from './staffDevice';
import { classifyLanding, deviceType, isBot, type Landing } from './trafficSource';

/**
 * Counts storefront visits for the console's Analytics screen.
 *
 * A visitor is a random id this browser keeps; a session is one sitting, which
 * ends after 30 idle minutes. Where the visitor came from is worked out once,
 * when the session starts, and never again — after that every click is inside
 * the shop and says nothing about how they found it.
 *
 * Nothing here may ever get in a shopper's way. Every failure — no storage, no
 * network, no database — is swallowed, and the shop carries on.
 */

const VISITOR_KEY = 'jr-visitor-id';
const SESSION_KEY = 'jr-visit-session';
const SESSION_IDLE_MS = 30 * 60_000;

/*
  Paths carrying something private are folded to their shape. An order id is
  the key to that customer's confirmation page, and the report only needs to
  know that someone looked at one.
*/
const PRIVATE_PATHS: Array<[RegExp, string]> = [
  [/^\/order\/[^/]+/, '/order/:id'],
  [/^\/laybuy\/pay\/[^/]+/, '/laybuy/pay/:id'],
  [/^\/laybuy\/(?!pay(\/|$))[^/]+/, '/laybuy/:id'],
];

export function normalisePath(pathname: string): string {
  let path = pathname.replace(/\/{2,}/g, '/') || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  for (const [pattern, replacement] of PRIVATE_PATHS) path = path.replace(pattern, replacement);
  return path.slice(0, 300);
}

/* ── Storage that tolerates being refused ──────────────────────────────── */

const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* ── Who is not a visitor ──────────────────────────────────────────────── */

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/*
  Only the live website counts. Local development, Cloudflare preview
  deployments and the test suite all run this same code, and none of them
  are customers.
*/
function isLiveSite(): boolean {
  const live = hostOf(config.SITE_URL);
  return Boolean(live) && window.location.hostname.replace(/^www\./, '') === live;
}

function shouldTrack(): boolean {
  if (!isLiveSite()) return false;
  if (navigator.webdriver) return false;
  if (isBot(navigator.userAgent)) return false;
  if (isStaffDevice()) return false;
  return true;
}

/* ── Location ──────────────────────────────────────────────────────────── */

interface Geo {
  country: string | null;
  city: string | null;
}

/*
  Cloudflare already knows the town and country of every connection; the
  site's worker hands that back at /api/geo. Asked once per session, and given
  a second and a half — a visit without a town is still a visit.
*/
async function lookUpGeo(): Promise<Geo> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch('/api/geo', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return { country: null, city: null };
    const body = (await response.json()) as Partial<Geo>;
    return {
      country: typeof body.country === 'string' ? body.country : null,
      city: typeof body.city === 'string' ? body.city : null,
    };
  } catch {
    return { country: null, city: null };
  } finally {
    window.clearTimeout(timer);
  }
}

/* ── Recording ─────────────────────────────────────────────────────────── */

interface StoredSession {
  id: string;
  lastSeen: number;
}

function currentSession(now: number): { id: string; isNew: boolean } {
  let stored: StoredSession | null = null;
  try {
    stored = JSON.parse(read(SESSION_KEY) ?? 'null') as StoredSession | null;
  } catch {
    stored = null;
  }

  const alive = stored && typeof stored.id === 'string' && now - Number(stored.lastSeen) < SESSION_IDLE_MS;
  const id = alive ? stored!.id : uuid();
  write(SESSION_KEY, JSON.stringify({ id, lastSeen: now } satisfies StoredSession));
  return { id, isNew: !alive };
}

function visitorId(): string {
  const existing = read(VISITOR_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const id = uuid();
  write(VISITOR_KEY, id);
  return id;
}

/*
  The referrer and the link's tags belong to the page load, not to the tab. A
  shopper who leaves the shop open over lunch and comes back starts a new
  session, but did not arrive from Google a second time.
*/
let firstViewOfThisPage = true;

/*
  Views go out one at a time, in order. The first view of a session carries
  where the visitor came from and creates the session row; a quick second click
  must not overtake it and create the row with none of that.
*/
let queue: Promise<unknown> = Promise.resolve();
let lastPath: string | null = null;

export function trackPageView(pathname: string) {
  if (typeof window === 'undefined' || !shouldTrack()) return;

  const path = normalisePath(pathname);
  if (path === lastPath) return;
  lastPath = path;

  const session = currentSession(Date.now());
  const visitor = visitorId();

  // Read now, not when the queue gets to it: by then the shopper may have
  // clicked on, and the address bar no longer holds the link they came in on.
  const origin = session.isNew
    ? classifyLanding({
        referrer: firstViewOfThisPage ? document.referrer : '',
        search: firstViewOfThisPage ? window.location.search : '',
        ownHost: window.location.hostname,
        userAgent: navigator.userAgent,
      })
    : null;
  firstViewOfThisPage = false;

  queue = queue
    .then(() => send(session.id, visitor, path, origin))
    // A failed view must not jam the queue for every view after it.
    .catch(() => undefined);
}

async function send(session: string, visitor: string, path: string, origin: Landing | null) {
  let landing: Record<string, string | null> | null = null;
  if (origin) {
    const geo = await lookUpGeo();
    landing = {
      ...origin,
      device: deviceType(navigator.userAgent, navigator.maxTouchPoints ?? 0),
      country: geo.country,
      city: geo.city,
    };
  }

  // Resolves with an error rather than throwing; either way there is nothing
  // to do about it from here.
  await supabase.rpc('record_site_visit', {
    p_session: session,
    p_visitor: visitor,
    p_path: path,
    p_landing: landing,
  });
}
