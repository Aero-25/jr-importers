import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { config, isConfigured } from './env';

export type Client = SupabaseClient<Database>;

/**
 * One client per document.
 *
 * The storefront and the POS console are separate HTML entries, so each gets
 * its own instance — but within a page this must be a singleton or Supabase
 * warns about multiple GoTrue clients racing on the same storage key.
 */
export const supabase: Client = createClient<Database>(
  config.SUPABASE_URL || 'http://localhost:54321',
  config.SUPABASE_ANON_KEY || 'anon-key-not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Shop and console share this one key on one origin, so a sign-out on
      // either surface signs out the other too. Splitting the key per entry
      // would isolate them, but would also sign every existing session out
      // once — a deliberate migration, not a drive-by change.
      storageKey: 'jr-importers-auth',
    },
    global: {
      headers: { 'x-client-info': 'jr-importers-web/2.0' },
    },
    db: { schema: 'public' },
  },
);

export { isConfigured };

/**
 * Supabase surfaces failures as a `{ data, error }` pair rather than throwing.
 * Unwrapping here means React Query's error states actually fire.
 */
export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new SupabaseError(result.error.message);
  if (result.data === null) throw new SupabaseError('Query returned no data.');
  return result.data;
}

/** Same as `unwrap`, but a missing row is a legitimate `null` rather than an error. */
export function unwrapMaybe<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): T | null {
  if (result.error) throw new SupabaseError(result.error.message);
  return result.data;
}

export class SupabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseError';
  }
}

/** Turns a Postgres/PostgREST failure into something a shop assistant can act on. */
export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/JWT|not authenticated|session/i.test(raw)) {
    return 'Your session expired. Please sign in again.';
  }
  if (/row-level security|permission denied/i.test(raw)) {
    return 'You do not have permission to do that.';
  }
  if (/duplicate key/i.test(raw)) {
    return 'That record already exists.';
  }
  if (/foreign key/i.test(raw)) {
    return 'That record is still linked to something else and cannot be removed.';
  }
  if (/Failed to fetch|NetworkError/i.test(raw)) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return raw;
}
