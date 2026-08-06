import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart, useCartTotals } from '@/data/cart';
import { money } from '@/lib/format';
import { Button, Card, EmptyState, IconButton } from '@/ui';
import { useSeo } from '../seo';

export default function Cart() {
  useSeo({ title: 'Your cart', path: '/cart', noIndex: true });

  const navigate = useNavigate();
  const { lines, setQuantity, remove, clear } = useCart();
  const totals = useCartTotals(lines);

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={<ShoppingBag className="h-10 w-10" />}
          title="Your cart is empty"
          message="Once you add something, it will wait here for you."
          action={<Button onClick={() => navigate('/shop')}>Start shopping</Button>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Your cart</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {totals.itemCount} item{totals.itemCount === 1 ? '' : 's'}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <ul className="space-y-3">
          {lines.map((line) => {
            const overStock = line.available_stock > 0 && line.quantity > line.available_stock;

            return (
              <li key={`${line.product_id}-${line.color ?? ''}`}>
                <Card className="flex gap-4 p-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-raised">
                    {line.image ? (
                      <img
                        src={line.image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink-subtle">
                        <ShoppingBag aria-hidden className="h-6 w-6" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                    {line.color && <p className="text-xs text-ink-subtle">{line.color}</p>}
                    <p className="tabular mt-1 text-sm text-ink-muted">{money(line.price)} each</p>

                    {overStock && (
                      <p className="mt-1 text-xs text-warn">
                        Only {line.available_stock} left — quantity will be reduced at checkout.
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center rounded-lg border border-hairline">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(line.product_id, line.color ?? null, line.quantity - 1)
                          }
                          aria-label={`Decrease quantity of ${line.name}`}
                          className="p-2 text-ink-muted hover:text-ink"
                        >
                          <Minus aria-hidden className="h-3.5 w-3.5" />
                        </button>
                        <span className="tabular w-8 text-center text-sm text-ink">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(line.product_id, line.color ?? null, line.quantity + 1)
                          }
                          disabled={line.quantity >= line.available_stock}
                          aria-label={`Increase quantity of ${line.name}`}
                          className="p-2 text-ink-muted hover:text-ink disabled:opacity-40"
                        >
                          <Plus aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <IconButton
                        label={`Remove ${line.name}`}
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={() => remove(line.product_id, line.color ?? null)}
                      />
                    </div>
                  </div>

                  <p className="tabular shrink-0 self-start font-display text-base font-semibold text-ink">
                    {money(line.price * line.quantity)}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Summary</h2>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular text-ink">{money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Delivery</dt>
                <dd className="text-ink-muted">Calculated at checkout</dd>
              </div>
              <div className="flex justify-between border-t border-hairline pt-2 text-base font-semibold">
                <dt className="text-ink">Total</dt>
                <dd className="tabular text-ink">{money(totals.total)}</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-ink-subtle">Includes VAT</dt>
                <dd className="tabular text-ink-subtle">{money(totals.vat)}</dd>
              </div>
            </dl>

            <Button fullWidth size="lg" className="mt-5" onClick={() => navigate('/checkout')}>
              Checkout
            </Button>

            <div className="mt-3 flex items-center justify-between">
              <Link to="/shop" className="text-sm text-brand-400 hover:underline">
                Keep shopping
              </Link>
              <button
                type="button"
                onClick={clear}
                className="text-xs text-ink-subtle underline hover:text-danger"
              >
                Empty cart
              </button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
