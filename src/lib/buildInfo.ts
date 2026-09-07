/**
 * Which build this is, and whether a newer one is out.
 *
 * The Android app bundles its own copy of the console instead of loading the
 * site, so it keeps running whatever code its APK was built from until someone
 * downloads and installs a new one. Nothing told anybody that: a till installed
 * in June would still be missing the stock guard, the service lines and the
 * invoice fix, and the person standing at it had no way to know.
 *
 * The build time is baked in at compile time; the server publishes its own in
 * `/build.json`. Comparing the two is enough to say "you are behind" without
 * any version numbering to maintain.
 */

declare const __BUILD_TIME__: string;

/** When this bundle was built. Baked in by vite.config.js. */
export const BUILD_TIME: string =
  typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

/** `07 Sep 2026, 14:32` — for showing a cashier which build a till is on. */
export function buildLabel(iso: string = BUILD_TIME): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * True when the console is running from inside the installed Android app.
 *
 * Only the app can be stale — a browser fetches the current bundle every time,
 * so telling a browser user to reinstall would be nonsense.
 */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Capacitor' in window || /; wv\)/i.test(navigator.userAgent);
}

export interface UpdateState {
  /** A newer build is published than the one running. */
  stale: boolean;
  /** When the server's build was made, if it could be reached. */
  serverBuild: string | null;
}

/**
 * Asks the site what it last published.
 *
 * Fails quietly: a till with no signal is not out of date, it is offline, and
 * a banner it cannot act on would just be noise. Cache is bypassed because the
 * service worker would otherwise answer with the copy that shipped in the APK.
 */
export async function checkForUpdate(origin = 'https://jrimporters.com'): Promise<UpdateState> {
  if (!BUILD_TIME) return { stale: false, serverBuild: null };
  try {
    const res = await fetch(`${origin}/build.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return { stale: false, serverBuild: null };
    const { builtAt } = (await res.json()) as { builtAt?: string };
    if (!builtAt) return { stale: false, serverBuild: null };

    const mine = new Date(BUILD_TIME).getTime();
    const theirs = new Date(builtAt).getTime();
    if (Number.isNaN(mine) || Number.isNaN(theirs)) return { stale: false, serverBuild: builtAt };

    // A minute of slack: the build stamp and the deploy are not the same
    // instant, and a banner over a few seconds' drift would cry wolf.
    return { stale: theirs - mine > 60_000, serverBuild: builtAt };
  } catch {
    return { stale: false, serverBuild: null };
  }
}
