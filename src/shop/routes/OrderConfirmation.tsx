import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Package } from 'lucide-react';
import { orderItems, useOrder } from '@/data/orders';
import { formatDateTime, money } from '@/lib/format';
import { Card, ErrorState, LoadingScreen, StatusBadge } from '@/ui';
import { useSeo } from '../seo';

export default function OrderConfirmation() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError, error, refetch } = useOrder(id);

  useSeo({ title: 'Order confirmed', noIndex: true });

  if (isLoading) return <LoadingScreen label="Loading your order…" />;

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">Order not found</h1>
        <p className="mt-2 text-ink-muted">
          It may belong to a different account. Sign in with the email you ordered under.
        </p>
        <Link
          to="/account"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-400"
        >
          Go to my account
        </Link>
      </div>
    );
  }

  const items = orderItems(order);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="text-center">
        <CheckCircle2 aria-hidden className="mx-auto h-14 w-14 text-success" />
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
          Order confirmed
        </h1>
        <p className="mt-2 text-ink-muted">
          Thank you, {order.customer_name}. We have your order and will be in touch shortly with
          payment and delivery details.
        </p>
      </div>

      <Card className="mt-8 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Order reference</p>
            <p className="font-mono text-sm text-ink">{order.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <dl className="grid gap-3 border-b border-hairline py-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Placed</dt>
            <dd className="text-ink">{formatDateTime(order.created_at)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Delivery</dt>
            <dd className="text-ink">{order.delivery_method ?? '—'}</dd>
          </div>
          {order.delivery_address && (
            <div className="sm:col-span-2">
              <dt className="text-ink-muted">Address</dt>
              <dd className="text-ink">{order.delivery_address}</dd>
            </div>
          )}
        </dl>

        <ul className="divide-y divide-hairline py-2">
          {items.map((item, index) => (
            <li key={`${item.product_id}-${index}`} className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="tabular text-ink-muted">{item.quantity}×</span>{' '}
                <span className="text-ink">{item.name}</span>
                {item.color && <span className="text-ink-subtle"> · {item.color}</span>}
              </span>
              <span className="tabular shrink-0 text-ink">
                {money(item.price * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="space-y-1.5 border-t border-hairline pt-4 text-sm">
          {Number(order.coupon_discount) > 0 && (
            <div className="flex justify-between text-success">
              <dt>Discount {order.coupon_code && `(${order.coupon_code})`}</dt>
              <dd className="tabular">−{money(order.coupon_discount)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <dt className="text-ink">Total</dt>
            <dd className="tabular text-ink">{money(order.total_amount)}</dd>
          </div>
          <div className="flex justify-between text-xs">
            <dt className="text-ink-subtle">Includes VAT</dt>
            <dd className="tabular text-ink-subtle">{money(order.vat_amount)}</dd>
          </div>
        </dl>
      </Card>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          to="/account"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-400"
        >
          <Package aria-hidden className="h-4 w-4" />
          Track my orders
        </Link>
        <Link
          to="/shop"
          className="inline-flex h-10 items-center rounded-lg border border-hairline px-4 text-sm font-medium text-ink hover:border-brand-400"
        >
          Keep shopping
        </Link>
      </div>
    </div>
  );
}
