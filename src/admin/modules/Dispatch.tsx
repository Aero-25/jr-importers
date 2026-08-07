import { useState } from 'react';
import { FileText, MessageCircle, Truck } from 'lucide-react';
import type { OrderRow } from '@/lib/database.types';
import { orderItems, useOrders, useUpdateOrder } from '@/data/orders';
import { formatDate, money, relativeTime } from '@/lib/format';
import { dispatchWhatsAppLink, downloadDispatchNote } from '@/lib/dispatchNote';
import {
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  Select,
  StatusBadge,
  type Column,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

const COURIERS = ['NamPost', 'DHL', 'Paxi', 'Own driver', 'Other'];

/** The fulfilment queue: paid orders that still owe the customer a handover. */
export default function Dispatch() {
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const orders = useOrders({
    statuses: ['Paid', 'Processing', 'Ready for Collection', 'Dispatched'],
  });

  const columns: Column<OrderRow>[] = [
    {
      key: 'ref',
      header: 'Reference',
      render: (order) => (
        <span className="font-mono text-xs">{order.id.slice(0, 8).toUpperCase()}</span>
      ),
      width: '9rem',
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (order) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{order.customer_name ?? 'Walk-in'}</p>
          <p className="truncate text-xs text-ink-subtle">{order.customer_phone ?? '—'}</p>
        </div>
      ),
      sortValue: (order) => order.customer_name ?? '',
    },
    {
      key: 'destination',
      header: 'Destination',
      secondary: true,
      render: (order) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{order.delivery_method ?? '—'}</p>
          <p className="truncate text-xs text-ink-subtle">
            {order.customer_city ?? order.customer_region ?? '—'}
          </p>
        </div>
      ),
      sortValue: (order) => order.delivery_method ?? '',
    },
    {
      key: 'items',
      header: 'Units',
      align: 'right',
      render: (order) => (
        <span className="tabular">
          {orderItems(order).reduce((n, item) => n + item.quantity, 0)}
        </span>
      ),
    },
    {
      key: 'waybill',
      header: 'Waybill',
      secondary: true,
      render: (order) =>
        order.waybill_number ? (
          <Badge tone="info" size="sm">
            {order.waybill_number}
          </Badge>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => <StatusBadge status={order.status} size="sm" />,
      sortValue: (order) => order.status,
    },
    {
      key: 'age',
      header: 'Waiting',
      render: (order) => (
        <span className="text-xs text-ink-muted">{relativeTime(order.created_at)}</span>
      ),
      sortValue: (order) => order.created_at,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Dispatch"
        description="Orders that are paid and still waiting to reach the customer."
      />

      <div className="p-6">
        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          <DataTable
            rows={orders.data ?? []}
            columns={columns}
            rowKey={(order) => order.id}
            loading={orders.isLoading}
            onRowClick={setSelected}
            defaultSort={{ key: 'age', direction: 'asc' }}
            empty={{
              title: 'Nothing to dispatch',
              message: 'Every paid order has been handed over.',
            }}
          />
        </div>
      </div>

      {selected && <DispatchDialog order={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function DispatchDialog({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const toast = useToast();
  const updateOrder = useUpdateOrder();

  const [courier, setCourier] = useState(order.courier_company ?? COURIERS[0]!);
  const [waybill, setWaybill] = useState(order.waybill_number ?? '');
  const [notes, setNotes] = useState(order.delivery_notes ?? '');

  async function markDispatched() {
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        values: {
          status: 'Dispatched',
          courier_company: courier,
          waybill_number: waybill.trim() || null,
          delivery_notes: notes.trim() || null,
          date_dispatched: new Date().toISOString(),
        },
      });
      toast.success('Marked dispatched', waybill ? `Waybill ${waybill}` : undefined);
      onClose();
    } catch (error) {
      toast.error('Could not update', error instanceof Error ? error.message : undefined);
    }
  }

  async function markCollected() {
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        values: {
          status: 'Completed',
          picked_up_at: new Date().toISOString(),
        },
      });
      toast.success('Marked collected');
      onClose();
    } catch (error) {
      toast.error('Could not update', error instanceof Error ? error.message : undefined);
    }
  }

  const isCollection = order.delivery_method === 'Collection';

  return (
    <Modal
      open
      onClose={onClose}
      title={`Dispatch ${order.id.slice(0, 8).toUpperCase()}`}
      description={`${order.customer_name ?? 'Walk-in'} · ${money(order.total_amount)}`}
      footer={
        <>
          <Button
            variant="secondary"
            className="mr-auto"
            icon={<FileText className="h-4 w-4" />}
            onClick={() =>
              downloadDispatchNote(order).catch((e) =>
                toast.error('Could not build the note', e instanceof Error ? e.message : undefined),
              )
            }
          >
            Dispatch note
          </Button>
          {order.customer_phone && (
            <Button
              variant="ghost"
              icon={<MessageCircle className="h-4 w-4" />}
              onClick={() => window.open(dispatchWhatsAppLink(order), '_blank', 'noopener')}
            >
              Tell the customer
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {isCollection ? (
            <Button variant="success" onClick={markCollected} loading={updateOrder.isPending}>
              Mark collected
            </Button>
          ) : (
            <Button
              icon={<Truck className="h-4 w-4" />}
              onClick={markDispatched}
              loading={updateOrder.isPending}
            >
              Mark dispatched
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-hairline rounded-card border border-hairline">
          {orderItems(order).map((item, index) => (
            <li key={index} className="flex gap-3 px-3 py-2 text-sm">
              <span className="tabular w-8 shrink-0 text-ink-muted">{item.quantity}×</span>
              <span className="min-w-0 flex-1 truncate text-ink">{item.name}</span>
              {item.imei && <span className="font-mono text-xs text-ink-subtle">{item.imei}</span>}
            </li>
          ))}
        </ul>

        {order.delivery_address && (
          <div className="rounded-lg bg-raised p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Deliver to</p>
            <p className="mt-0.5 text-ink">{order.delivery_address}</p>
            <p className="text-ink-muted">
              {[order.customer_city, order.customer_region].filter(Boolean).join(', ')}
            </p>
          </div>
        )}

        {!isCollection && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Courier"
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              options={COURIERS}
            />
            <Input
              label="Waybill number"
              value={waybill}
              onChange={(e) => setWaybill(e.target.value)}
            />
            <Input
              label="Delivery notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              containerClassName="sm:col-span-2"
            />
          </div>
        )}

        {order.date_dispatched && (
          <p className="text-xs text-ink-subtle">
            Dispatched {formatDate(order.date_dispatched)} via {order.courier_company ?? 'courier'}.
          </p>
        )}
      </div>
    </Modal>
  );
}
