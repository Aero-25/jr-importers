import { createClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from './config';

let client;

export function getSupabaseClient() {
  if (client) return client;

  const config = getRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Supabase URL and anon key are required.');
  }

  client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}
