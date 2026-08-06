import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isConfigured } from '@/lib/supabase';
import { LoadingScreen, Notice } from '@/ui';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { RepairsBand } from './components/RepairsBand';
import { ScrollToTop } from './components/ScrollToTop';

// Route-level splitting: the landing page must not carry the checkout form or
// the account screens in its first byte.
const Home = lazy(() => import('./routes/Home'));
const Catalog = lazy(() => import('./routes/Catalog'));
const ProductDetail = lazy(() => import('./routes/ProductDetail'));
const Cart = lazy(() => import('./routes/Cart'));
const Checkout = lazy(() => import('./routes/Checkout'));
const OrderConfirmation = lazy(() => import('./routes/OrderConfirmation'));
const Account = lazy(() => import('./routes/Account'));
const Support = lazy(() => import('./routes/Support'));
const About = lazy(() => import('./routes/About'));
const JobCardAccept = lazy(() => import('./routes/JobCardAccept'));
const NotFound = lazy(() => import('./routes/NotFound'));

export function ShopApp() {
  const location = useLocation();

  // The job-card link is a task, not a visit: someone opening it on WhatsApp
  // is finishing a repair booking, often in a queue. Shop navigation and the
  // footer would only be in the way, so it renders bare.
  if (location.pathname.startsWith('/jobcard/')) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="field" aria-hidden />
        <div className="relative z-10">
          <Suspense fallback={<LoadingScreen />}>
            <Routes location={location}>
              <Route path="/jobcard/:token" element={<JobCardAccept />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* The ambient light field. Glass has nothing to refract without it. */}
      <div className="field" aria-hidden />

      <ScrollToTop />
      <Header />

      <main id="main" className="relative z-10 flex-1">
        {!isConfigured && (
          <div className="mx-auto max-w-5xl px-4 pt-4">
            <Notice tone="warn" title="Store not connected">
              Supabase credentials are missing, so no products can load. Set
              <code className="mx-1 font-mono text-xs">VITE_SUPABASE_URL</code> and
              <code className="mx-1 font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>, or populate
              <code className="mx-1 font-mono text-xs">/config.js</code>.
            </Notice>
          </div>
        )}

        <Suspense fallback={<LoadingScreen label="Loading…" />}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Catalog />} />
            <Route path="/shop/:group" element={<Catalog />} />
            <Route path="/product/:slug" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order/:id" element={<OrderConfirmation />} />
            <Route path="/account/*" element={<Account />} />
            <Route path="/support" element={<Support />} />
            <Route path="/about" element={<About />} />
            {/* Legal pages stay as static HTML so they render without the bundle. */}
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      <RepairsBand />
      <Footer />
    </div>
  );
}
