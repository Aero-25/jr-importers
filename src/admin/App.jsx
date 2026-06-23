import { lazy, Suspense, useMemo, useState } from 'react';
import { Toast } from './components/Toast.jsx';
import { useAdminData } from './hooks/useAdminData';
import { formatCurrency } from './lib/format';
import { getLowStockSuggestions } from './modules/stock/lowStock';

const ProductsModule = lazy(() => import('./modules/products/ProductsModule.jsx').then((module) => ({ default: module.ProductsModule })));
const OrdersModule = lazy(() => import('./modules/orders/OrdersModule.jsx').then((module) => ({ default: module.OrdersModule })));
const StockModule = lazy(() => import('./modules/stock/StockModule.jsx').then((module) => ({ default: module.StockModule })));

function LoginScreen({ onSignIn, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSignIn(email, password);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">JR Importers</p>
        <h1>Admin Login</h1>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
        {error && <div className="form-error">{error}</div>}
        <button className="button primary" type="submit" disabled={loading}>Sign In</button>
      </form>
    </main>
  );
}

export function App() {
  const { db, session, authLoading, data, loading, refresh, signIn, signOut } = useAdminData();
  const [view, setView] = useState('dashboard');
  const [toast, setToast] = useState(null);

  function notify(message, type = 'info') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }

  const stats = useMemo(() => {
    const onlineOrders = data.orders.filter((order) => order.payment_method !== 'Cash');
    const paidOrders = onlineOrders.filter((order) => order.status === 'Paid');
    return {
      products: data.products.length,
      onlineOrders: onlineOrders.length,
      lowStock: getLowStockSuggestions(data.products).length,
      revenue: paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
    };
  }, [data.orders, data.products]);

  if (authLoading) {
    return <main className="loading-screen">Checking admin session...</main>;
  }

  if (!session) {
    return <LoginScreen onSignIn={signIn} loading={loading} />;
  }

  const nav = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'products', label: 'Products' },
    { id: 'orders', label: 'Online Orders' },
    { id: 'stock', label: 'Low Stock' }
  ];

  return (
    <div className="admin-app">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <aside className="sidebar">
        <div className="brand-block">
          <span>JR</span>
          <div>
            <strong>JR Importers</strong>
            <small>Modular Admin</small>
          </div>
        </div>
        <nav>
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? 'active' : ''} type="button" onClick={() => setView(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <button className="button ghost" type="button" onClick={signOut}>Sign Out</button>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Signed in</p>
            <h2>{session.user.email}</h2>
          </div>
          <button className="button ghost" type="button" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </header>

        {view === 'dashboard' && (
          <section className="module">
            <header className="module-header">
              <div>
                <h1>Dashboard</h1>
                <p>Focused Vite admin for product, order, and stock workflows.</p>
              </div>
            </header>
            <div className="cards-grid">
              <article><span>Products</span><strong>{stats.products}</strong></article>
              <article><span>Online Orders</span><strong>{stats.onlineOrders}</strong></article>
              <article><span>Low Stock</span><strong>{stats.lowStock}</strong></article>
              <article><span>Paid Revenue</span><strong>{formatCurrency(stats.revenue)}</strong></article>
            </div>
          </section>
        )}

        <Suspense fallback={<section className="module">Loading module...</section>}>
          {view === 'products' && (
            <ProductsModule
              db={db}
              products={data.products}
              productImeis={data.product_imeis}
              onRefresh={refresh}
              notify={notify}
            />
          )}

          {view === 'orders' && (
            <OrdersModule db={db} orders={data.orders} onRefresh={refresh} notify={notify} />
          )}

          {view === 'stock' && (
            <StockModule
              db={db}
              products={data.products}
              suppliers={data.suppliers}
              onRefresh={refresh}
              notify={notify}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}
