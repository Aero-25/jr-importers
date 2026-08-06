import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/app/providers';
import { ToastProvider } from '@/ui';
import '@/styles/global.css';
import JobCardAccept from '@/storefront/routes/JobCardAccept';

/**
 * The job-card link, as its own document.
 *
 * This is the one URL customers *receive* rather than click through to, so it
 * must not depend on a server rewrite to resolve. A real file plus a query
 * string works on any host — Cloudflare Pages in advanced mode, GitHub Pages,
 * a plain bucket — with no routing rules at all.
 *
 * No router, no auth provider: the page is reached by token and needs neither.
 */
const token = new URLSearchParams(window.location.search).get('t') ?? '';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="min-h-screen bg-canvas">
          <div className="field" aria-hidden />
          <div className="relative z-10">
            <JobCardAccept tokenOverride={token} />
          </div>
        </div>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
