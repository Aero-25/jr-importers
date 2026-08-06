// JR Importers runtime configuration.
//
// Swapped per environment without rebuilding — the Capacitor Android shell and
// the Cloudflare deploy both replace this file. Build-time VITE_* values, when
// present, take precedence over anything here.
//
// Only publishable values belong in this file. The Supabase publishable key is
// safe to ship because row-level security is the real boundary; a service-role
// key or a management (sbp_) token must never appear here.
window.JR_CONFIG = Object.freeze({
    SUPABASE_URL: 'https://snkvszndxwpozrefnpnv.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_RPEWx6y1yijT88qbFR1bcg_tP75Lqo8',
    LOGO_URL: '/icon.svg',
    AERO_LOGO_URL: '/icon.svg',
    SMS_WORKER_URL: '',
    WHATSAPP_WORKER_URL: '',
    ONESIGNAL_APP_ID: '',
    ONESIGNAL_SAFARI_WEB_ID: '',
    PAYMENT_WORKER_URL: '',
    STORE_WHATSAPP_NUMBER: '+264815629203',
    SITE_URL: 'https://jr-importers.pages.dev'
});
