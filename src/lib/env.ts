/**
 * Runtime configuration.
 *
 * Resolution order, first non-empty wins:
 *   1. Vite build-time env (`VITE_*`) — used by CI and local dev.
 *   2. `window.JR_CONFIG` from `/config.js` — the legacy mechanism, kept
 *      deliberately. The Capacitor Android shell and the Cloudflare deploy both
 *      swap that file to retarget an environment without a rebuild.
 *
 * Only ever put publishable values here. The Supabase anon key is safe to ship
 * (RLS is the real boundary); a service-role key never is.
 */

export interface RuntimeConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  LOGO_URL: string;
  AERO_LOGO_URL: string;
  SMS_WORKER_URL: string;
  WHATSAPP_WORKER_URL: string;
  ONESIGNAL_APP_ID: string;
  ONESIGNAL_SAFARI_WEB_ID: string;
  /** Cloudflare Worker base that mints and verifies DPO payment tokens. */
  PAYMENT_WORKER_URL: string;
  STORE_WHATSAPP_NUMBER: string;
  /** Canonical origin, used for SEO tags and structured data. */
  SITE_URL: string;
}

declare global {
  interface Window {
    JR_CONFIG?: Partial<RuntimeConfig>;
  }
}

const DEFAULTS: RuntimeConfig = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  LOGO_URL: '/icon-192.png',
  AERO_LOGO_URL: '/icon.svg',
  SMS_WORKER_URL: '',
  WHATSAPP_WORKER_URL: '',
  ONESIGNAL_APP_ID: '',
  ONESIGNAL_SAFARI_WEB_ID: '',
  PAYMENT_WORKER_URL: '',
  STORE_WHATSAPP_NUMBER: '',
  // The live domain. This is not cosmetic: it is the host of every job card
  // link sent to a customer, so a value that does not resolve produces a link
  // that fails in their hand, with nothing on our side to show for it.
  SITE_URL: 'https://jrimporters.com',
};

const viteEnv = import.meta.env as Record<string, string | undefined>;

function resolve(key: keyof RuntimeConfig): string {
  const fromVite = viteEnv[`VITE_${key}`];
  if (fromVite) return fromVite;

  const fromWindow = typeof window !== 'undefined' ? window.JR_CONFIG?.[key] : undefined;
  if (fromWindow) return fromWindow;

  return DEFAULTS[key];
}

export const config: RuntimeConfig = {
  SUPABASE_URL: resolve('SUPABASE_URL'),
  SUPABASE_ANON_KEY: resolve('SUPABASE_ANON_KEY'),
  LOGO_URL: resolve('LOGO_URL'),
  AERO_LOGO_URL: resolve('AERO_LOGO_URL'),
  SMS_WORKER_URL: resolve('SMS_WORKER_URL'),
  WHATSAPP_WORKER_URL: resolve('WHATSAPP_WORKER_URL'),
  ONESIGNAL_APP_ID: resolve('ONESIGNAL_APP_ID'),
  ONESIGNAL_SAFARI_WEB_ID: resolve('ONESIGNAL_SAFARI_WEB_ID'),
  PAYMENT_WORKER_URL: resolve('PAYMENT_WORKER_URL'),
  STORE_WHATSAPP_NUMBER: resolve('STORE_WHATSAPP_NUMBER'),
  SITE_URL: resolve('SITE_URL'),
};

/** True once Supabase is reachable. Screens render an explicit setup notice otherwise. */
export const isConfigured = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);

/**
 * Where staff download the console's Android build.
 *
 * CI uploads every APK to the public `apk` storage bucket. A GitHub release
 * exists too, but the repo is private, so its download URL turns a staff
 * phone away with a 404 — storage is the copy the buttons must point at.
 */
export const ADMIN_APK_URL = `${config.SUPABASE_URL}/storage/v1/object/public/apk/JR-Importers-Admin.apk`;

export const isDev = import.meta.env.DEV;
