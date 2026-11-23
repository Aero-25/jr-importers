import { useEffect } from 'react';

/** The JR loader, inline: shown while a page's code is loading. Styles live in index.html. */
export function ShopLoader() {
  return (
    <div className="jr-loader jr-loader--inline" role="status" aria-label="Loading">
      <div className="jr-loader__mark">
        <img src="/logo-mark.png" alt="" width={44} height={80} />
      </div>
      <div className="jr-loader__word">
        JR<span>IMPORTERS</span>
      </div>
      <div className="jr-loader__bar">
        <i />
      </div>
    </div>
  );
}

/**
 * Fades out the full-screen loader from index.html. Render it inside the
 * route's Suspense boundary: it only mounts once the page's code has arrived,
 * so the loader hands over to a real page rather than a spinner.
 */
export function BootDone() {
  useEffect(() => {
    const boot = document.getElementById('jr-boot');
    if (!boot) return;
    boot.classList.add('is-done');
    const timer = window.setTimeout(() => boot.remove(), 600);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
