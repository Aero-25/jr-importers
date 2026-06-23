// Formatting helpers — currency is Namibian Dollar (N$ / NAD).

export const CURRENCY = 'N$';

export function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString('en-NA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function money2(value) {
  const n = Number(value || 0);
  return n.toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

// Stable, manifest-style order reference from a UUID.
export function orderRef(id) {
  if (!id) return 'JR-—';
  return 'JR-' + String(id).replace(/-/g, '').slice(0, 6).toUpperCase();
}

// Collect a product's gallery images, de-duplicated, in slot order.
export function productImages(p) {
  if (!p) return [];
  const imgs = [p.image, p.image1, p.image2, p.image3, p.image4, p.image5]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  return [...new Set(imgs)];
}

export function primaryImage(p) {
  return productImages(p)[0] || '';
}

// Spec rows present on a product, in display order.
const SPEC_FIELDS = [
  ['spec_display', 'Display'],
  ['spec_processor', 'Processor'],
  ['spec_ram', 'Memory'],
  ['spec_storage', 'Storage'],
  ['spec_battery', 'Battery'],
  ['spec_back_camera', 'Rear camera'],
  ['spec_front_camera', 'Front camera'],
  ['spec_os', 'Operating system'],
  ['spec_weight', 'Weight'],
  ['spec_extras', 'In the box / extras'],
];

export function specRows(p) {
  if (!p) return [];
  return SPEC_FIELDS
    .map(([key, label]) => [label, (p[key] || '').trim()])
    .filter(([, v]) => v);
}

// A couple of headline specs for compact cards.
export function quickSpecs(p) {
  if (!p) return [];
  return [p.spec_storage, p.spec_ram, p.spec_display]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function stockState(stock) {
  const n = Number(stock || 0);
  if (n <= 0) return { label: 'Out of stock', cls: 'is-out' };
  if (n <= 5) return { label: `Only ${n} left`, cls: 'is-low' };
  return { label: 'In stock', cls: '' };
}
