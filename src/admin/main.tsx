import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { installErrorReporting } from '@/lib/errorReporter';
import '@/styles/global.css';
import { AdminApp } from './App';

// Installed before the first render, so a fault during boot is still caught.
installErrorReporting();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(
  <StrictMode>
    {/*
      Hash routing, not history routing.

      The console has to run from three places that disagree about paths: a
      static host at /admin.html, the Capacitor APK where copy-web.js renames
      the file to index.html and serves it locally, and any future subdirectory
      deploy. A hash never reaches the server, so all three work with no
      rewrite rules and no basename to keep in sync. The console is noindex,
      so the usual SEO objection to hash URLs does not apply.
    */}
    <HashRouter>
      <AppProviders>
        <AdminApp />
      </AppProviders>
    </HashRouter>
  </StrictMode>,
);
