export function formatCurrency(amount) {
  return `N$ ${Number(amount || 0).toLocaleString('en-NA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatDateTime(value) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('en-NA');
}

export function statusTone(status) {
  const tones = {
    Pending: 'warning',
    Paid: 'success',
    Packing: 'info',
    Processing: 'info',
    Shipped: 'purple',
    Delivered: 'success',
    Cancelled: 'danger',
    Expired: 'danger'
  };

  return tones[status] || 'muted';
}
