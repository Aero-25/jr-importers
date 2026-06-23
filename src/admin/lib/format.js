// Formatting helpers. Currency is Namibian Dollar (N$ / NAD).

export function money(amount, dp = 2) {
  return `N$ ${Number(amount || 0).toLocaleString('en-NA', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
export function money0(amount) { return money(amount, 0); }
export function num(amount, dp = 2) {
  return Number(amount || 0).toLocaleString('en-NA', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// Backwards-compatible aliases used by older modules.
export const formatCurrency = (a) => money(a, 2);

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function shortDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function timeOnly(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
export function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (['paid', 'completed', 'delivered', 'received', 'closed'].some((k) => s.includes(k))) return 'success';
  if (['pending', 'draft', 'open', 'processing', 'packing'].some((k) => s.includes(k))) return 'warning';
  if (['cancel', 'expired', 'refund', 'void'].some((k) => s.includes(k))) return 'danger';
  if (['shipped', 'dispatched'].some((k) => s.includes(k))) return 'info';
  return 'muted';
}

export function orderRef(id) {
  if (!id) return 'JR-—';
  return 'JR-' + String(id).replace(/-/g, '').slice(0, 6).toUpperCase();
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}

export function productImage(p) {
  return [p?.image, p?.image1, p?.image2].map((s) => (s || '').trim()).find(Boolean) || '';
}

export function stockTone(p) {
  const s = Number(p?.stock || 0);
  const r = Number(p?.reorder_level || 10);
  if (s <= 0) return 'out';
  if (s <= r) return 'low';
  return 'ok';
}
