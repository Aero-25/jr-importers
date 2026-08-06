import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import '@/styles/global.css';
import { AdminApp } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(
  <StrictMode>
    {/* Served at /admin.html, so every console route hangs off that basename. */}
    <BrowserRouter basename="/admin.html">
      <AppProviders>
        <AdminApp />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
