import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import type { ProductRow } from '@/lib/database.types';
import { money, slugify } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, StockBadge } from '@/ui';
import { useCart } from '@/data/cart';
import { useToast } from '@/ui';

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
  const toast = useToast();
  const outOfStock = product.stock <= 0;

  function addToCart() {
    const result = add(product, 1);
    if (result.reason === 'insufficient-stock') {
      toast.warn('Out of stock', `${product.name} is not available right now.`);
      return;
    }
    toast.success('Added to cart', product.name);
  }

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-card border border-hairline bg-surface',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out',
        'hover:-translate-y-1 hover:border-brand-300 hover:shadow-lift',
        className,
      )}
    >
      {/*
        `cover`, not `contain`: this catalogue is lifestyle photography rather
        than cut-outs on white, so filling the square reads better than letter-
        boxing it. The faint grey underneath only shows while the image loads.
      */}
      <Link
        to={productPath(product)}
        className="relative block aspect-square overflow-hidden bg-raised"
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-subtle">
            <ShoppingBag aria-hidden className="h-10 w-10" />
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {product.featured && (
            <Badge tone="lime" size="sm">
              Featured
            </Badge>
          )}
          {outOfStock && (
            <Badge tone="danger" size="sm">
              Sold out
            </Badge>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-3">
        {product.brand && (
          <p className="text-2xs font-medium uppercase tracking-wide text-ink-subtle">
            {product.brand}
          </p>
        )}

        <h3 className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-ink">
          <Link to={productPath(product)} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>

        <div className="mt-auto pt-3">
          <p className="tabular font-display text-lg font-bold text-brand-700">
            {money(product.price)}
          </p>
          <div className="mt-1.5">
            <StockBadge stock={product.stock} reorderLevel={product.reorder_level} size="sm" />
          </div>

          {/* Lime is reserved for the one action on the card. */}
          <Button
            size="sm"
            fullWidth
            variant={outOfStock ? 'secondary' : 'lime'}
            disabled={outOfStock}
            onClick={addToCart}
            // Sits above the card-wide link overlay.
            className="relative z-10 mt-3"
            icon={<ShoppingBag className="h-3.5 w-3.5" />}
          >
            {outOfStock ? 'Sold out' : 'Add to cart'}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** Matches ProductCard's box so the grid does not reflow when data lands. */
export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-surface" aria-hidden>
      <div className="skeleton aspect-square" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-5 w-1/2 rounded" />
        <div className="skeleton mt-3 h-8 w-full rounded-lg" />
      </div>
    </div>
  );
}
