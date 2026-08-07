import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { isConfigured } from '@/lib/supabase';
import { LoadingScreen, Notice } from '@/ui';
import { AdminShell } from './components/AdminShell';
import { SignIn } from './components/SignIn';

const Dashboard = lazy(() => import('./modules/Dashboard'));
const Pos = lazy(() => import('./modules/Pos'));
const CashUps = lazy(() => import('./modules/CashUps'));
const Orders = lazy(() => import('./modules/Orders'));
const Refunds = lazy(() => import('./modules/Refunds'));
const Dispatch = lazy(() => import('./modules/Dispatch'));
const Products = lazy(() => import('./modules/Products'));
const JobCards = lazy(() => import('./modules/JobCards'));
const Records = lazy(() => import('./modules/Records'));
const Ledger = lazy(() => import('./modules/Ledger'));
const Settings = lazy(() => import('./modules/Settings'));
const Activity = lazy(() => import('./modules/Activity'));
const GoodsReceived = lazy(() => import('./modules/GoodsReceived'));
const Finance = lazy(() => import('./modules/Finance'));
const Reports = lazy(() => import('./modules/Reports'));
const Faults = lazy(() => import('./modules/Faults'));

const ADMIN_ONLY_PATHS = [
  '/purchase-orders',
  '/expenses',
  '/coupons',
  '/staff',
  '/ledger',
  '/settings',
  '/activity',
  '/finance',
  '/errors',
  '/reports',
];

function NotPermitted() {
  return (
    <div className="p-8">
      <Notice tone="warn" title="You do not have access to this screen">
        This one is limited to managers. Ask an administrator if you need it.
      </Notice>
    </div>
  );
}

export function AdminApp() {
  const { ready, isAuthenticated, isStaff, isAdmin, profile } = useAuth();

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <Notice tone="danger" title="Console not connected">
          Supabase credentials are missing. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, or populate <code>/config.js</code>.
        </Notice>
      </div>
    );
  }

  if (!ready) return <LoadingScreen label="Checking your access…" />;
  if (!isAuthenticated) return <SignIn />;

  // Authenticated but not staff: a customer who found the URL. Say so plainly
  // rather than showing an empty console.
  if (!isStaff) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <Notice tone="warn" title="No console access">
          The account {profile?.email ?? ''} is not a staff account. Ask an administrator to grant
          you a staff role.
        </Notice>
      </div>
    );
  }

  return (
    <AdminShell>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<Pos />} />
          <Route path="/cash-ups" element={<CashUps />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/dispatch" element={<Dispatch />} />
          <Route path="/products" element={<Products />} />
          <Route path="/job-cards" element={<JobCards />} />

          {/* Schema-driven CRUD covers the modules with no bespoke domain rules. */}
          <Route path="/customers" element={<Records resource="customers" />} />
          <Route path="/suppliers" element={<Records resource="suppliers" />} />
          <Route path="/messages" element={<Records resource="messages" />} />
          <Route path="/requests" element={<Records resource="requests" />} />
          <Route path="/stock-alerts" element={<Records resource="stock_alerts" />} />
          <Route path="/quotes" element={<Records resource="quotes" />} />
          <Route path="/invoices" element={<Records resource="invoices" />} />
          <Route path="/laybys" element={<Records resource="laybys" />} />
          <Route path="/grv" element={<GoodsReceived />} />
          <Route path="/stock-takes" element={<Records resource="stock_takes" />} />

          {isAdmin && (
            <>
              <Route path="/purchase-orders" element={<Records resource="purchase_orders" />} />
              <Route path="/expenses" element={<Records resource="expenses" />} />
              <Route path="/coupons" element={<Records resource="coupons" />} />
              <Route path="/staff" element={<Records resource="users" />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/finance" element={<Finance />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/errors" element={<Faults />} />
            </>
          )}

          {/* Without these, a cashier following a bookmark to a manager screen
              is told the page does not exist, which sends them looking for a
              bug instead of asking for access. */}
          {!isAdmin &&
            ADMIN_ONLY_PATHS.map((path) => (
              <Route key={path} path={path} element={<NotPermitted />} />
            ))}

          <Route
            path="*"
            element={
              <div className="p-8">
                <Notice tone="warn" title="Module not found">
                  That console page does not exist, or your role cannot open it.
                </Notice>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </AdminShell>
  );
}
