import { supabase } from './supabase';

/**
 * Reports client-side faults to the database.
 *
 * The failure this exists to end is not the dramatic one. It is the cashier who
 * hits an error, works around it, and never mentions it — so the bug survives
 * for months and the shop quietly stops using a feature.
 *
 * Repeats are folded into a counter server-side, so a render loop that throws
 * on every frame costs one row rather than ten thousand.
 */

/** Faults already sent this session. Stops a loop hammering the network. */
const sentThisSession = new Map<string, number>();
const MAX_PER_FINGERPRINT = 3;

function fingerprint(message: string, stack?: string): string {
  // The first stack frame is what distinguishes two faults with the same
  // message; the rest is noise that changes between builds.
  const frame = stack?.split('\n')[1]?.trim().replace(/:\d+:\d+\)?$/, '') ?? '';
  return `${message.slice(0, 120)}|${frame.slice(0, 80)}`;
}

let installed = false;

export function reportError(error: unknown, surface?: string, context?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message || 'Unknown error';

  // Noise that says nothing and cannot be acted on.
  if (/ResizeObserver loop|Non-Error promise rejection captured/i.test(message)) return;

  const fp = fingerprint(message, err.stack);
  const seen = sentThisSession.get(fp) ?? 0;
  if (seen >= MAX_PER_FINGERPRINT) return;
  sentThisSession.set(fp, seen + 1);

  void supabase
    .rpc('report_client_error', {
      p_fingerprint: fp,
      p_message: message,
      p_stack: err.stack ?? null,
      p_surface: surface ?? window.location.hash ?? window.location.pathname,
      p_url: window.location.href,
      p_user_agent: navigator.userAgent,
      p_context: (context ?? null) as never,
    })
    // Reporting a fault must never itself become a fault. If the network is
    // down, the thing we would report is the network being down.
    .then(undefined, () => undefined);
}

/** Catches what React does not: async rejections and non-React throws. */
export function installErrorReporting() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, undefined, {
      source: event.filename,
      line: event.lineno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, undefined, { kind: 'unhandledrejection' });
  });
}
