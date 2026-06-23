import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDateTime, statusTone } from '../../lib/format';
import { getNextOrderStatus, getOrderStepIndex, getReservationCountdown, ORDER_WORKFLOW } from './workflow';

export function OrdersModule({ db, orders, onRefresh, notify }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const onlineOrders = useMemo(() => orders.filter((order) => order.payment_method !== 'Cash'), [orders]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return onlineOrders
      .filter((order) => {
        if (filter === 'all') return true;
        if (filter === 'packing') return ['Processing', 'Packing'].includes(order.status);
        return String(order.status || '').toLowerCase() === filter;
      })
      .filter((order) => {
        if (!needle) return true;
        return [order.id, order.customer_name, order.customer_email, order.customer_phone, order.payment_reference]
          .some((value) => String(value || '').toLowerCase().includes(needle));
      });
  }, [filter, onlineOrders, search]);

  async function updateStatus(order, nextStatus = getNextOrderStatus(order)) {
    if (nextStatus === 'Shipped' && order.delivery_method === 'Courier') {
      const courier_company = prompt('Courier company');
      if (!courier_company) return;
      const waybill_number = prompt('Waybill / tracking number');
      if (!waybill_number) return;
      const { error } = await db.from('orders').update({
        status: 'Shipped',
        courier_company,
        waybill_number,
        date_dispatched: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', order.id);
      if (error) {
        notify(error.message, 'error');
        return;
      }
    } else {
      const status = nextStatus === 'Packing' ? 'Processing' : nextStatus;
      const updates = { status, updated_at: new Date().toISOString() };
      if (nextStatus === 'Paid') updates.paid_at = new Date().toISOString();
      if (nextStatus === 'Delivered') updates.picked_up_at = new Date().toISOString();
      const { error } = await db.from('orders').update(updates).eq('id', order.id);
      if (error) {
        notify(error.message, 'error');
        return;
      }
    }

    notify(`Order moved to ${nextStatus}`, 'success');
    onRefresh();
  }

  async function cancelOrder(order) {
    if (!confirm(`Cancel order #${order.id}?`)) return;
    const { error } = await db.from('orders').update({
      status: 'Cancelled',
      updated_at: new Date().toISOString()
    }).eq('id', order.id);
    if (error) {
      notify(error.message, 'error');
      return;
    }
    notify('Order cancelled', 'success');
    onRefresh();
  }

  return (
    <section className="module">
      <header className="module-header">
        <div>
          <h1>Online Orders</h1>
          <p>{filtered.length} of {onlineOrders.length} online orders</p>
        </div>
        <div className="toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders" />
          {['all', 'pending', 'paid', 'packing', 'shipped', 'delivered'].map((item) => (
            <button key={item} className={`button ${filter === item ? 'primary' : 'ghost'}`} type="button" onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </header>

      <div className="cards-grid">
        <article><span>Pending</span><strong>{onlineOrders.filter((order) => order.status === 'Pending').length}</strong></article>
        <article><span>Paid</span><strong>{onlineOrders.filter((order) => order.status === 'Paid').length}</strong></article>
        <article><span>Packing</span><strong>{onlineOrders.filter((order) => ['Processing', 'Packing'].includes(order.status)).length}</strong></article>
        <article><span>Revenue</span><strong>{formatCurrency(onlineOrders.filter((order) => order.status === 'Paid').reduce((sum, order) => sum + Number(order.total_amount || 0), 0))}</strong></article>
      </div>

      <div className="orders-list">
        {filtered.map((order) => {
          const countdown = getReservationCountdown(order, now);
          const stepIndex = getOrderStepIndex(order.status);
          const nextStatus = getNextOrderStatus(order);

          return (
            <article className="order-card" key={order.id}>
              <header>
                <div>
                  <strong>#{order.id}</strong>
                  <span>{order.customer_name || 'Unknown customer'} · {formatDateTime(order.created_at)}</span>
                </div>
                <span className={`badge ${statusTone(order.status)}`}>{order.status === 'Processing' ? 'Packing' : order.status}</span>
              </header>

              <div className="workflow-rail">
                {ORDER_WORKFLOW.map((step, index) => (
                  <span className={index <= stepIndex ? 'done' : ''} key={step.status}>
                    {step.label}
                  </span>
                ))}
              </div>

              <div className="order-meta">
                <span>{(order.items || []).length} item(s)</span>
                <span>{formatCurrency(order.total_amount)}</span>
                <span>{order.payment_method || 'No payment method'}</span>
                <span className={`reservation ${countdown.expired ? 'expired' : countdown.urgent ? 'urgent' : ''}`}>{countdown.label}</span>
              </div>

              <footer>
                {!['Delivered', 'Cancelled', 'Expired'].includes(order.status) && (
                  <button className="button primary" type="button" onClick={() => updateStatus(order, nextStatus)}>
                    Move to {nextStatus}
                  </button>
                )}
                <button className="button ghost" type="button" onClick={() => updateStatus(order, 'Delivered')}>Delivered</button>
                <button className="button danger" type="button" onClick={() => cancelOrder(order)}>Cancel</button>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
