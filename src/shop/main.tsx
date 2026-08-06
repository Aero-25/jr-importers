import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import '@/styles/global.css';
import { ShopApp } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <ShopApp />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);

// The service worker is a progressive enhancement; a failure must not break the
// shop, and in dev it would serve stale bundles.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support unavailable — shop still works online */
    });
  });
}
