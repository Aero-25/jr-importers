import React, { useState, Suspense, lazy } from 'react';
import { Icon, Spinner } from './components/ui.jsx';
import { useAuth, useData, useRoute, useTill, navigate } from './lib/store.jsx';
import { cashierName } from './lib/db.js';

const Dashboard = lazy(() => import('./views/Dashboard.jsx'));
const POS = lazy(() => import('./views/POS.jsx'));
const CashUp = lazy(() => import('./views/CashUp.jsx'));
const Stock = lazy(() => import('./views/Stock.jsx'));
const Invoices = lazy(() => import('./views/Invoices.jsx'));
const Sales = lazy(() => import('./views/Sales.jsx'));
const People = lazy(() => import('./views/People.jsx'));
const Expenses = lazy(() => import('./views/Expenses.jsx'));
const Reports = lazy(() => import('./views/Reports.jsx'));
const Settings = lazy(() => import('./views/Settings.jsx'));
const JobCards = lazy(() => import('./views/JobCards.jsx'));

const NAV = [
  { group: 'Sell', items: [
    { id: 'pos', label: 'Point of sale', icon: Icon.pos },
  ] },
  { group: 'Operate', items: [
    { id: 'jobcards', label: 'Job cards', icon: Icon.cog },
    { id: 'cashup', label: 'Cash up', icon: Icon.cash },
    { id: 'stock', label: 'Stock & products', icon: Icon.box },
    { id: 'sales', label: 'Sales & orders', icon: Icon.receipt },
    { id: 'invoices', label: 'Invoices', icon: Icon.invoice },
  ] },
  { group: 'Manage', items: [
    { id: 'people', label: 'Customers & suppliers', icon: Icon.users },
    { id: 'expenses', label: 'Expenses', icon: Icon.wallet },
  ] },
  { group: 'Insights', items: [
    { id: 'dashboard', label: 'Dashboard', icon: Icon.grid },
    { id: 'reports', label: 'Reports', icon: Icon.chart },
    { id: 'settings', label: 'Settings', icon: Icon.cog },
  ] },
];
const FLAT = NAV.flatMap((g) => g.items);
const TITLES = Object.fromEntries(FLAT.map((i) => [i.id, i.label]));
const TABS = ['pos', 'stock', 'sales', 'cashup', 'dashboard'];

const VIEWS = { jobcards: JobCards, dashboard: Dashboard, pos: POS, cashup: CashUp, stock: Stock, invoices: Invoices, sales: Sales, people: People, expenses: Expenses, reports: Reports, settings: Settings };

function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await signIn(email, password); } catch (e2) { setErr(e2?.message || 'Sign in failed'); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__logo">J<i>R</i></div>
        <div className="eyebrow">JR Importers</div>
        <h1>Staff sign in</h1>
        <p>Point of sale &amp; back office — Walvis Bay.</p>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="you@jrimporters.com" /></div>
        <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></div>
        {err && <div className="form-error">{err}</div>}
        <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={busy}>{busy ? <Spinner /> : 'Sign in'}</button>
      </form>
    </div>
  );
}

function Rail({ view }) {
  const { user, signOut } = useAuth();
  const data = useData();
  const { openShift } = useTill();
  const lowCount = (data.products || []).filter((p) => Number(p.stock || 0) <= Number(p.reorder_level || 10) && Number(p.stock || 0) >= 0).length;
  const pendingOrders = (data.orders || []).filter((o) => String(o.status).toLowerCase() === 'pending').length;
  const badges = { stock: lowCount, sales: pendingOrders };
  return (
    <aside className="rail">
      <div className="rail__brand">
        <span className="rail__logo">J<i>R</i></span>
        <span className="rail__title">JR Importers<small>POS · ADMIN</small></span>
      </div>
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="rail__group">{g.group}</div>
          {g.items.map((it) => (
            <button key={it.id} className={`rail__link ${view === it.id ? 'is-active' : ''}`} onClick={() => navigate(`/${it.id}`)}>
              <it.icon /> {it.label}
              {badges[it.id] > 0 && <span className="pill">{badges[it.id]}</span>}
            </button>
          ))}
        </div>
      ))}
      <div className="rail__spacer" />
      <div className="rail__user">
        <span className="login__logo" style={{ width: 34, height: 34, fontSize: 14, marginBottom: 0, borderRadius: 10 }}><Icon.user width={16} height={16} /></span>
        <div style={{ minWidth: 0 }}>
          <b>{cashierName(user)}</b>
          <small>{openShift ? 'Till open' : 'Till closed'}</small>
        </div>
        <button className="icon-btn" onClick={signOut} aria-label="Sign out" style={{ marginLeft: 'auto' }}><Icon.logout /></button>
      </div>
    </aside>
  );
}

function TabBar({ view }) {
  const data = useData();
  const lowCount = (data.products || []).filter((p) => Number(p.stock || 0) <= Number(p.reorder_level || 10)).length;
  const tabIcons = { pos: Icon.pos, stock: Icon.box, sales: Icon.receipt, cashup: Icon.cash, dashboard: Icon.grid };
  const tabLabels = { pos: 'Sell', stock: 'Stock', sales: 'Sales', cashup: 'Cash', dashboard: 'More' };
  return (
    <nav className="tabbar">
      {TABS.map((id) => {
        const I = tabIcons[id];
        return (
          <button key={id} className={`tab ${view === id ? 'is-active' : ''}`} onClick={() => navigate(`/${id}`)}>
            {id === 'stock' && lowCount > 0 && <span className="pill" />}
            <I /> {tabLabels[id]}
          </button>
        );
      })}
    </nav>
  );
}

export default function App() {
  const { ready, user, isAdmin } = useAuth();
  const { view } = useRoute();
  const { refresh, loading } = useData();

  if (!ready) return <div className="loading-screen">Checking session…</div>;
  if (!user) return <Login />;

  const Current = VIEWS[view] || Dashboard;
  const isPos = view === 'pos';

  return (
    <div className="app">
      <Rail view={view} />
      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => navigate('/dashboard')} aria-label="Menu"><Icon.menu /></button>
          <div>
            <h1>{TITLES[view] || 'JR Importers'}</h1>
            {!isAdmin && <div className="topbar__sub" style={{ color: 'var(--warn)' }}>Limited access — ask an owner to enable admin</div>}
          </div>
          <div className="topbar__spacer" />
          <button className="icon-btn icon-btn--bd" onClick={refresh} aria-label="Refresh data" title="Refresh">
            {loading ? <Spinner /> : <Icon.refresh />}
          </button>
        </header>
        <div className={`content ${isPos ? 'content--flush' : ''}`}>
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}><Spinner size={26} /></div>}>
            <Current />
          </Suspense>
        </div>
      </main>
      <TabBar view={view} />
    </div>
  );
}
