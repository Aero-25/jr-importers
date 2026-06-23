export const ORDER_WORKFLOW = [
  { status: 'Pending', label: 'Pending Payment', icon: 'clock' },
  { status: 'Paid', label: 'Paid', icon: 'check-circle' },
  { status: 'Packing', label: 'Packing', icon: 'box-open' },
  { status: 'Shipped', label: 'Ready/Dispatched', icon: 'truck' },
  { status: 'Delivered', label: 'Delivered', icon: 'flag-checkered' }
];

export function getOrderStepIndex(status) {
  const normalized = status === 'Processing' ? 'Packing' : status;
  return Math.max(0, ORDER_WORKFLOW.findIndex((step) => step.status === normalized));
}

export function getNextOrderStatus(order) {
  if (!order) return 'Pending';
  if (order.status === 'Pending') return 'Paid';
  if (order.status === 'Paid') return 'Packing';
  if (order.status === 'Processing' || order.status === 'Packing') return 'Shipped';
  if (order.status === 'Shipped') return 'Delivered';
  return order.status || 'Pending';
}

export function getReservationCountdown(order, now = Date.now()) {
  if (!order?.reservation_expires_at) {
    return { label: 'No reservation timer', expired: false, urgent: false, minutesRemaining: null };
  }

  const expiresAt = new Date(order.reservation_expires_at).getTime();
  const diff = expiresAt - now;
  const minutesRemaining = Math.ceil(diff / 60000);

  if (diff <= 0) {
    return { label: 'Reservation expired', expired: true, urgent: true, minutesRemaining };
  }

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return {
    label: hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`,
    expired: false,
    urgent: diff <= 6 * 3600000,
    minutesRemaining
  };
}
