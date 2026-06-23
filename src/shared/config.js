export function getRuntimeConfig() {
  const legacyConfig = window.JR_CONFIG || {};

  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || legacyConfig.SUPABASE_URL || '',
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || legacyConfig.SUPABASE_ANON_KEY || '',
    logoUrl: import.meta.env.VITE_LOGO_URL || legacyConfig.LOGO_URL || '/icon.svg',
    whatsappNumber: import.meta.env.VITE_STORE_WHATSAPP_NUMBER || '26481562920'
  };
}
