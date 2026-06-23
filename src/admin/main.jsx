import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AdminProviders } from './lib/store.jsx';

createRoot(document.getElementById('root')).render(
  <AdminProviders>
    <App />
  </AdminProviders>
);
