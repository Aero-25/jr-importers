import { Link } from 'react-router-dom';
import { Phone, Scale, ShoppingBag } from 'lucide-react';
import type { ProductRow } from '@/lib/database.types';
import { STORE, isServiceCategory } from '@/lib/constants';
import { money, slugify } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, StockBadge } from '@/ui';
import { useCart } from '@/data/cart';
import { useCompare } from '@/data/compare';
import { useToast } from '@/ui';
import '../commerce.css';

export function productPath(product: Pick<ProductRow, 'id' | 'name'>): string {
  return `/product/${product.id}-${slugify(product.name)}`;
}

export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductRow;
  /** Skip lazy-loading for the handful of cards above the fold. */
  priority?: boolean;
  className?: string;
}) {
  const { add } = useCart();
  const compare = useCompare();
  const toast = useToast();
  const service = isServiceCategory(product.category);
  const outOfStock = !service && product.stock <= 0;
  const compared = compare.has(product.id);

  function toggleCompare() {
    const result = compare.toggle(product);
    if (result === 'full') {
      toast.warn('Three at a time', 'Remove a product on the compare page first.');
    } else if (result === 'added') {
      toast.success('Added to compare', product.name);
    }
  }

  function addToCart() {
    const result = add(product, 1);
    if (result.reason === 'in-store-only') {
      toast.info('Booked at the shop', `Call ${STORE.phone} to book ${product.name}.`);
      return;
    }
    if (result.reason === 'insufficient-stock') {
      toast.warn('Out of stock', `${product.name} is not available right now.`);
      return;
    }
    toast.success('Added to cart', product.name);
  }

  return (
    <article
      className={cn(
        'coast-product group relative flex flex-col overflow-hidden',
        className,
      )}
    >
      {/* Give every device room in its image well without cropping it. */}
      <Link
        to={productPath(product)}
        className="coast-product__image relative block aspect-square overflow-hidden"
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-subtle">
            <ShoppingBag aria-hidden className="h-10 w-10" />
          </div>
        )}

        <div className="coast-product__badges absolute left-3 top-3 flex flex-col gap-1">
          {/* Solid, not a soft tint: these badges sit on photography, where a
              12%-alpha fill leaves the label unreadable. */}
          {service ? (
            <span className="coast-product__service-badge inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-semibold text-white shadow-card">
              In-store service
            </span>
          ) : (
            product.featured && (
              <Badge tone="lime" size="sm">
                Featured
              </Badge>
            )
          )}
          {outOfStock && (
            <Badge tone="danger" size="sm" className="coast-product__sold-badge">
              Sold out
            </Badge>
          )}
        </div>
      </Link>

      {/* Above the card-wide link overlay, like the cart button. */}
      {!service && (
        <button
          type="button"
          onClick={toggleCompare}
          aria-label={compared ? `Remove ${product.name} from compare` : `Compare ${product.name}`}
          aria-pressed={compared}
          title={compared ? 'Remove from compare' : 'Compare'}
          className={cn(
            'coast-product__compare absolute right-4 top-4 z-10 rounded-full p-2 transition-colors',
            compared
              ? 'bg-lime-500 text-brand-800'
              : 'bg-white/85 text-ink-muted hover:bg-white hover:text-ink',
          )}
        >
          <Scale aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="coast-product__body flex flex-1 flex-col">
        {product.brand && (
          <p className="coast-product__brand text-2xs font-medium uppercase tracking-wide text-ink-subtle">
            {product.brand}
          </p>
        )}

        <h3 className="coast-product__name mt-1 line-clamp-2 font-semibold leading-snug text-ink">
          <Link to={productPath(product)} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>

        <div className="mt-auto pt-3">
          <p className="coast-product__price tabular font-display font-bold text-brand-700">
            {service ? `From ${money(product.price)}` : money(product.price)}
          </p>

          <div className="mt-1.5">
            {service ? (
              <Badge tone="info" size="sm">
                Quoted at the counter
              </Badge>
            ) : (
              // No figure on a card: the catalogue cannot tell whether a
              // product's count is IMEI-backed, and an unverified number in
              // public is a promise the shop has not agreed to.
              <StockBadge
                stock={product.stock}
                reorderLevel={product.reorder_level}
                size="sm"
                showCount={false}
              />
            )}
          </div>

          {/*
            Repairs are booked in at the shop — a technician has to see the
            handset before the price is real. So the action is a phone call,
            not a cart.
          */}
          {service ? (
            <a
              href={`tel:${STORE.phone.replace(/\s/g, '')}`}
              className="coast-product__action relative z-10 mt-4 flex items-center justify-center gap-1.5 px-3 text-xs font-semibold transition-colors"
            >
              <Phone aria-hidden className="h-3.5 w-3.5" />
              Book at the shop
            </a>
          ) : (
            <Button
              size="md"
              fullWidth
              variant={outOfStock ? 'secondary' : 'primary'}
              disabled={outOfStock}
              onClick={addToCart}
              // Sits above the card-wide link overlay.
              className="coast-product__action relative z-10 mt-4"
              icon={<ShoppingBag className="h-3.5 w-3.5" />}
            >
              {outOfStock ? 'Sold out' : 'Add to cart'}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Matches ProductCard's box so the grid does not reflow when data lands. */
export function ProductCardSkeleton() {
  return (
    <div className="coast-product overflow-hidden" aria-hidden>
      <div className="coast-product__image skeleton aspect-square" />
      <div className="coast-product__body space-y-2">
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-5 w-1/2 rounded" />
        <div className="skeleton mt-3 h-8 w-full rounded-lg" />
      </div>
    </div>
  );
}
