import { useState } from 'react';
import { Search } from 'lucide-react';
import type { OrderRow } from '@/lib/database.types';
import { orderItems, useOrders, useUpdateOrder } from '@/data/orders';
import { ORDER_STATUSES } from '@/lib/constants';
import { formatDateTime, money, relativeTime } from '@/lib/format';
import {
  Button,
  ConfirmDialog,
  DataTable,
  Input,
  Modal,
  Select,
  StatusBadge,
  type Column,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

export default function Orders() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<OrderRow | null>(null);

  const orders = useOrders({ search, status: status || null });

  const columns: Column<OrderRow>[] = [
    {
      key: 'ref',
      header: 'Reference',
      render: (order) => (
        <span className="font-mono text-xs">{order.id.slice(0, 8).toUpperCase()}</span>
      ),
      sortValue: (order) => order.id,
      width: '9rem',
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (order) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{order.customer_name ?? 'Walk-in'}</p>
          <p className="truncate text-xs text-ink-subtle">{order.customer_email ?? '—'}</p>
        </div>
      ),
      sortValue: (order) => order.customer_name ?? '',
    },
    {
      key: 'items',
      header: 'Items',
      align: 'right',
      secondary: true,
      render: (order) => (
        <span className="tabular">
          {orderItems(order).reduce((n, item) => n + item.quantity, 0)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (order) => <span className="tabular font-medium">{money(order.total_amount)}</span>,
      sortValue: (order) => Number(order.total_amount),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => <StatusBadge status={order.status} size="sm" />,
      sortValue: (order) => order.status,
    },
    {
      key: 'placed',
      header: 'Placed',
      secondary: true,
      render: (order) => (
        <span className="text-xs text-ink-muted" title={formatDateTime(order.created_at)}>
          {relativeTime(order.created_at)}
        </span>
      ),
      sortValue: (order) => order.created_at,
    },
  ];

  return (
    <>
      <ModuleHeader title="Orders" description="Every sale, online and at the counter." />

      <div className="p-6">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, phone, waybill…"
            leading={<Search className="h-4 w-4" />}
            containerClassName="min-w-64 flex-1"
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All statuses"
            options={ORDER_STATUSES.map((s) => ({ value: s, label: s }))}
            containerClassName="w-48"
          />
        </div>

        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          <DataTable
            rows={orders.data ?? []}
            columns={columns}
            rowKey={(order) => order.id}
            loading={orders.isLoading}
            onRowClick={setSelected}
            defaultSort={{ key: 'placed', direction: 'desc' }}
            empty={{
              title: 'No orders match',
              message: 'Adjust the search or status filter.',
            }}
          />
        </div>
      </div>

      <OrderDialog order={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function OrderDialog({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  const toast = useToast();
  const updateOrder = useUpdateOrder();
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!order) return null;
  const items = orderItems(order);

  async function changeStatus(next: string) {
    if (!order) return;
    try {
      // Cancelling has to hand the units back before the status flips, or the
      // stock stays reserved against an order nobody will ever fulfil.
      const releaseStock = next === 'Cancelled' && order.stock_reserved && !order.stock_returned;
      await updateOrder.mutateAsync({ id: order.id, values: { status: next }, releaseStock });
      toast.success('Order updated', `Status is now ${next}.`);
      onClose();
    } catch (error) {
      toast.error('Could not update', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Order ${order.id.slice(0, 8).toUpperCase()}`}
        description={formatDateTime(order.created_at)}
        size="lg"
        footer={
          <>
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>
              Cancel order
            </Button>
            <Select
              value={order.status}
              onChange={(e) => void changeStatus(e.target.value)}
              options={ORDER_STATUSES.map((s) => ({ value: s, label: s }))}
              containerClassName="w-48"
              aria-label="Change order status"
            />
          </>
        }
      >
        <div className="space-y-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Customer" value={order.customer_name} />
            <Detail label="Email" value={order.customer_email} />
            <Detail label="Phone" value={order.customer_phone} />
            <Detail label="Payment" value={order.payment_method} />
            <Detail label="Delivery" value={order.delivery_method} />
            <Detail label="Address" value={order.delivery_address} />
            {order.stock_reserved && (
              <Detail
                label="Stock"
                value={
                  order.stock_returned
                    ? 'Released'
                    : `Reserved until ${formatDateTime(order.reservation_expires_at)}`
                }
              />
            )}
            {order.delivery_notes && <Detail label="Notes" value={order.delivery_notes} />}
          </dl>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Items
            </h3>
            <ul className="divide-y divide-hairline rounded-card border border-hairline">
              {items.map((item, index) => (
                <li
                  key={`${item.product_id}-${index}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="tabular w-8 shrink-0 text-ink-muted">{item.quantity}×</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{item.name}</span>
                  <span className="tabular shrink-0 text-ink">
                    {money(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="space-y-1.5 border-t border-hairline pt-3 text-sm">
            {Number(order.coupon_discount) > 0 && (
              <div className="flex justify-between text-success">
                <dt>Discount {order.coupon_code && `(${order.coupon_code})`}</dt>
                <dd className="tabular">−{money(order.coupon_discount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold">
              <dt className="text-ink">Total</dt>
              <dd className="tabular text-ink">{money(order.total_amount)}</dd>
            </div>
            <div className="flex justify-between text-xs">
              <dt className="text-ink-subtle">Includes VAT</dt>
              <dd className="tabular text-ink-subtle">{money(order.vat_amount)}</dd>
            </div>
          </dl>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          void changeStatus('Cancelled');
        }}
        title="Cancel this order?"
        message="Any stock held for this order is returned to available. This cannot be undone."
        confirmLabel="Cancel order"
        cancelLabel="Keep it"
        loading={updateOrder.isPending}
      />
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-ink">{value || '—'}</dd>
    </div>
  );
}
