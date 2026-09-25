/**
 * Where a website visitor came from.
 *
 * Worked out once, when a visit starts, from the three things a browser offers:
 * the page that linked here (`document.referrer`), the tags on the link itself
 * (`utm_*` and ad click ids), and — when neither says anything — the app whose
 * built-in browser is showing the page.
 *
 * Kept free of imports so the tests can run it directly in Node.
 */

export type Channel =
  | 'Direct'
  | 'Search'
  | 'Social'
  | 'Messaging'
  | 'Email'
  | 'Ads'
  | 'Campaign'
  | 'Referral';

export interface Landing {
  /** The referring site's host without `www.`, or `app:<package>` for an Android app. */
  referrer_host: string | null;
  /** What the shop would call it: "Google", "WhatsApp", "flyer". */
  source: string;
  channel: Channel;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

interface Known {
  name: string;
  channel: Channel;
}

/*
  Checked in order, first match wins — so the specific entries (Gmail, Gemini)
  sit above the broad ones (anything on google.*) that would otherwise claim
  them.
*/
const HOSTS: Array<[RegExp, Known]> = [
  [/^mail\.google\./, { name: 'Gmail', channel: 'Email' }],
  [/^gemini\.google\./, { name: 'Gemini', channel: 'Referral' }],
  [/^(outlook\.(live|office|office365)\.com|outlook\.com)$/, { name: 'Outlook', channel: 'Email' }],
  [/^mail\.yahoo\./, { name: 'Yahoo Mail', channel: 'Email' }],

  [/(^|\.)google\.[a-z.]+$/, { name: 'Google', channel: 'Search' }],
  [/(^|\.)bing\.com$/, { name: 'Bing', channel: 'Search' }],
  [/(^|\.)yahoo\.[a-z.]+$/, { name: 'Yahoo', channel: 'Search' }],
  [/(^|\.)duckduckgo\.com$/, { name: 'DuckDuckGo', channel: 'Search' }],
  [/(^|\.)ecosia\.org$/, { name: 'Ecosia', channel: 'Search' }],
  [/(^|\.)yandex\.[a-z.]+$/, { name: 'Yandex', channel: 'Search' }],
  [/(^|\.)baidu\.com$/, { name: 'Baidu', channel: 'Search' }],
  [/^search\.brave\.com$/, { name: 'Brave Search', channel: 'Search' }],

  [/(^|\.)whatsapp\.(com|net)$|^wa\.me$/, { name: 'WhatsApp', channel: 'Messaging' }],
  [/(^|\.)telegram\.(org|me)$|^t\.me$/, { name: 'Telegram', channel: 'Messaging' }],
  [/(^|\.)messenger\.com$|^m\.me$/, { name: 'Messenger', channel: 'Messaging' }],

  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, { name: 'Facebook', channel: 'Social' }],
  [/(^|\.)instagram\.com$/, { name: 'Instagram', channel: 'Social' }],
  [/(^|\.)tiktok\.com$/, { name: 'TikTok', channel: 'Social' }],
  [/(^|\.)(twitter\.com|x\.com)$|^t\.co$/, { name: 'X (Twitter)', channel: 'Social' }],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, { name: 'LinkedIn', channel: 'Social' }],
  [/(^|\.)youtube\.com$|^youtu\.be$/, { name: 'YouTube', channel: 'Social' }],
  [/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/, { name: 'Pinterest', channel: 'Social' }],
  [/(^|\.)reddit\.com$/, { name: 'Reddit', channel: 'Social' }],
  [/(^|\.)snapchat\.com$/, { name: 'Snapchat', channel: 'Social' }],
  [/(^|\.)threads\.(net|com)$/, { name: 'Threads', channel: 'Social' }],

  [/(^|\.)(chatgpt\.com|openai\.com)$/, { name: 'ChatGPT', channel: 'Referral' }],
  [/(^|\.)perplexity\.ai$/, { name: 'Perplexity', channel: 'Referral' }],
  [/(^|\.)copilot\.microsoft\.com$/, { name: 'Copilot', channel: 'Referral' }],
];

/*
  Chrome on Android reports `android-app://<package>/` as the referrer when an
  app hands it a link. For this shop that is mostly WhatsApp, which would
  otherwise be invisible: a link tapped in a chat arrives with no website
  referrer at all.
*/
const APPS: Record<string, Known> = {
  'com.whatsapp': { name: 'WhatsApp', channel: 'Messaging' },
  'com.whatsapp.w4b': { name: 'WhatsApp', channel: 'Messaging' },
  'org.telegram.messenger': { name: 'Telegram', channel: 'Messaging' },
  'com.facebook.orca': { name: 'Messenger', channel: 'Messaging' },
  'com.facebook.katana': { name: 'Facebook', channel: 'Social' },
  'com.facebook.lite': { name: 'Facebook', channel: 'Social' },
  'com.instagram.android': { name: 'Instagram', channel: 'Social' },
  'com.zhiliaoapp.musically': { name: 'TikTok', channel: 'Social' },
  'com.ss.android.ugc.trill': { name: 'TikTok', channel: 'Social' },
  'com.twitter.android': { name: 'X (Twitter)', channel: 'Social' },
  'com.linkedin.android': { name: 'LinkedIn', channel: 'Social' },
  'com.snapchat.android': { name: 'Snapchat', channel: 'Social' },
  'com.google.android.gm': { name: 'Gmail', channel: 'Email' },
  'com.microsoft.office.outlook': { name: 'Outlook', channel: 'Email' },
  'com.google.android.googlequicksearchbox': { name: 'Google', channel: 'Search' },
  'com.google.android.youtube': { name: 'YouTube', channel: 'Social' },
};

/** What people actually type into `utm_source`, mapped onto the names above. */
const UTM_ALIASES: Record<string, string> = {
  fb: 'facebook',
  facebook: 'facebook',
  ig: 'instagram',
  insta: 'instagram',
  instagram: 'instagram',
  wa: 'whatsapp',
  whatsapp: 'whatsapp',
  google: 'google',
  tiktok: 'tiktok',
  tt: 'tiktok',
  twitter: 'x',
  x: 'x',
  linkedin: 'linkedin',
  youtube: 'youtube',
  yt: 'youtube',
  telegram: 'telegram',
  email: 'email',
  newsletter: 'email',
};

const UTM_KNOWN: Record<string, Known> = {
  facebook: { name: 'Facebook', channel: 'Social' },
  instagram: { name: 'Instagram', channel: 'Social' },
  whatsapp: { name: 'WhatsApp', channel: 'Messaging' },
  google: { name: 'Google', channel: 'Search' },
  tiktok: { name: 'TikTok', channel: 'Social' },
  x: { name: 'X (Twitter)', channel: 'Social' },
  linkedin: { name: 'LinkedIn', channel: 'Social' },
  youtube: { name: 'YouTube', channel: 'Social' },
  telegram: { name: 'Telegram', channel: 'Messaging' },
  email: { name: 'Email', channel: 'Email' },
};

const PAID_MEDIUMS = /^(cpc|ppc|cpm|cpv|paid|paid[-_ ]?social|paidsocial|paid[-_ ]?search|ads?|display|banner|sponsored|boost(ed)?)$/;
const SOCIAL_MEDIUMS = /^(social|social[-_ ]?media|sm|organic[-_ ]?social|post|story|reel)$/;
const EMAIL_MEDIUMS = /^(e[-_ ]?mail|newsletter)$/;

/** Click ids ad platforms append. Each one means that platform, and money spent. */
const CLICK_IDS: Array<[string, Known]> = [
  ['gclid', { name: 'Google', channel: 'Ads' }],
  ['gbraid', { name: 'Google', channel: 'Ads' }],
  ['wbraid', { name: 'Google', channel: 'Ads' }],
  ['msclkid', { name: 'Bing', channel: 'Ads' }],
  ['ttclid', { name: 'TikTok', channel: 'Ads' }],
  // Facebook stamps fbclid on every outbound link, paid or not.
  ['fbclid', { name: 'Facebook', channel: 'Social' }],
];

/** In-app browsers announce themselves in the user agent. */
const IN_APP: Array<[RegExp, Known]> = [
  [/Instagram/, { name: 'Instagram', channel: 'Social' }],
  [/FBAN|FBAV|FB_IAB|FBIOS/, { name: 'Facebook', channel: 'Social' }],
  [/musical_ly|BytedanceWebview|TikTok/i, { name: 'TikTok', channel: 'Social' }],
  [/Snapchat/, { name: 'Snapchat', channel: 'Social' }],
  [/LinkedInApp/, { name: 'LinkedIn', channel: 'Social' }],
  [/WhatsApp/, { name: 'WhatsApp', channel: 'Messaging' }],
];

function clean(value: string | null | undefined, max = 100): string | null {
  const text = (value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/** Turns a referrer URL into a host (or app), ignoring links from this site itself. */
export function referrerHost(referrer: string, ownHost: string): string | null {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol === 'android-app:') {
    const pkg = (url.host || url.pathname.replace(/^\/+/, '').split('/')[0] || '').toLowerCase();
    return pkg ? `app:${pkg}` : null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = bareHost(url.hostname);
  if (!host || host === bareHost(ownHost)) return null;
  return host;
}

function fromHost(host: string): Known {
  if (host.startsWith('app:')) {
    const pkg = host.slice(4);
    return APPS[pkg] ?? { name: pkg, channel: 'Referral' };
  }
  const known = HOSTS.find(([pattern]) => pattern.test(host));
  return known ? known[1] : { name: host, channel: 'Referral' };
}

function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Classifies how a visit started.
 *
 * Precedence: tags the shop put on its own link beat everything, because they
 * are the only signal that says which post or flyer it was. Ad click ids come
 * next, then the referring site, then the in-app browser. Nothing at all is
 * Direct — typed in, bookmarked, or a link from an app that hides itself.
 */
export function classifyLanding(input: {
  referrer: string;
  search: string;
  ownHost: string;
  userAgent?: string;
}): Landing {
  const params = new URLSearchParams(input.search);
  const utm_source = clean(params.get('utm_source'));
  const utm_medium = clean(params.get('utm_medium'));
  const utm_campaign = clean(params.get('utm_campaign'));
  const referrer_host = referrerHost(input.referrer, input.ownHost);
  const tagged = { referrer_host, utm_source, utm_medium, utm_campaign };

  if (utm_source) {
    const alias = UTM_ALIASES[utm_source.toLowerCase()];
    const known = alias ? UTM_KNOWN[alias] : undefined;
    const medium = (utm_medium ?? '').toLowerCase();
    const channel: Channel = PAID_MEDIUMS.test(medium)
      ? 'Ads'
      : EMAIL_MEDIUMS.test(medium)
        ? 'Email'
        : SOCIAL_MEDIUMS.test(medium)
          ? 'Social'
          : known?.channel ?? 'Campaign';
    return { ...tagged, source: known?.name ?? titleCase(utm_source), channel };
  }

  const click = CLICK_IDS.find(([param]) => params.has(param));
  if (click) return { ...tagged, source: click[1].name, channel: click[1].channel };

  if (referrer_host) {
    const known = fromHost(referrer_host);
    return { ...tagged, source: known.name, channel: known.channel };
  }

  const app = IN_APP.find(([pattern]) => pattern.test(input.userAgent ?? ''));
  if (app) return { ...tagged, source: app[1].name, channel: app[1].channel };

  return { ...tagged, source: 'Direct', channel: 'Direct' };
}

/** `mobile` / `tablet` / `desktop`, from the user agent and touch support. */
export function deviceType(userAgent: string, maxTouchPoints = 0): 'mobile' | 'tablet' | 'desktop' {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(userAgent)) return 'tablet';
  // iPadOS asks for the desktop site and reports itself as a Mac.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'tablet';
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

/** Crawlers and preview fetchers that run scripts. They are not visitors. */
export function isBot(userAgent: string): boolean {
  return /bot|crawl|spider|slurp|facebookexternalhit|embedly|headless|lighthouse|pagespeed|prerender|preview|scrape|monitor|pingdom|uptime/i.test(
    userAgent,
  );
}
