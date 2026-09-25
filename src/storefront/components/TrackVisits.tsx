import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Counts each page a shopper opens, for the console's Analytics screen.
 *
 * Rendered only inside the shop proper. The job-card link is left out on
 * purpose: those are repair customers answering a message the shop sent them,
 * and counting them would credit WhatsApp with traffic the shop made itself.
 *
 * The counter is fetched after the page has rendered rather than bundled into
 * it, so counting a visit never costs the shopper time on the first paint.
 */
export function TrackVisits() {
  const { pathname } = useLocation();

  useEffect(() => {
    import('@/lib/visitTracker').then(
      ({ trackPageView }) => trackPageView(pathname),
      () => undefined,
    );
  }, [pathname]);

  return null;
}
