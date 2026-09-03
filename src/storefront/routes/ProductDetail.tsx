import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BellRing,
  CalendarClock,
  Check,
  ChevronLeft,
  Minus,
  Phone,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import {
  colourSwatch,
  productImages,
  productSpecs,
  useProduct,
  useRelatedProducts,
  useVariants,
} from '@/data/products';
import { useCart } from '@/data/cart';
import { laybyDeposit, laybySuggestedInstalment } from '@/data/laybys';
import { supabase } from '@/lib/supabase';
import { STORE, isServiceCategory } from '@/lib/constants';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, ErrorState, LoadingScreen, Modal, Input, StockBadge, useToast } from '@/ui';
import { ProductCard } from '../components/ProductCard';
import { productJsonLd, useSeo } from '../seo';

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  // Slugs look like `142-samsung-galaxy-a16`; only the leading id is load-bearing.
  const id = Number(slug?.split('-')[0]);

  const navigate = useNavigate();
  const toast = useToast();
  const { add } = useCart();

  const { data: product, isLoading, isError, error, refetch } = useProduct(
    Number.isFinite(id) ? id : null,
  );
  const related = useRelatedProducts(product);

  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [alertOpen, setAlertOpen] = useState(false);
  const [colour, setColour] = useState<string | null>(null);

  // Handsets are stocked one unit at a time, so the colours on offer are
  // whatever is physically on the shelf rather than a list typed on the
  // product record.
  const variants = useVariants(product);

  const images = useMemo(() => (product ? productImages(product) : []), [product]);
  const specs = useMemo(() => (product ? productSpecs(product) : []), [product]);

  const jsonLd = useMemo(
    () =>
      product
        ? productJsonLd({
            id: product.id,
            name: product.name,
            description: product.description,
            brand: product.brand,
            price: Number(product.price),
            stock: product.stock,
            image: product.image,
            sku: product.sku,
          })
        : null,
    [product],
  );

  useSeo({
    title: product ? `${product.name} — ${money(product.price)}` : 'Product',
    description:
      product?.description?.slice(0, 155) ??
      (product ? `Buy the ${product.name} at JR Importers in Namibia.` : undefined),
    path: slug ? `/product/${slug}` : undefined,
    image: product?.image,
    jsonLd,
    noIndex: !product,
  });

  if (isLoading) return <LoadingScreen label="Loading product…" />;

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!product || !product.active) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">Product not available</h1>
        <p className="mt-2 text-ink-muted">
          This item may have been removed or sold out permanently.
        </p>
        <Button className="mt-6" onClick={() => navigate('/shop')}>
          Browse the shop
        </Button>
      </div>
    );
  }

  const service = isServiceCategory(product.category);
  const stockInfo = variants.data;
  const serialised = Boolean(stockInfo?.serialised);

  // With several colours in stock, availability is per colour — picking one
  // is what decides how many can go in the basket.
  const chosen = serialised ? stockInfo!.variants.find((v) => v.color === colour) : undefined;
  const needsColour = serialised && stockInfo!.variants.length > 1 && colour === null;
  const onHand = serialised
    ? (chosen?.available ?? stockInfo!.available)
    : (stockInfo?.available ?? product.stock);

  const outOfStock = !service && onHand <= 0;
  const maxQuantity = Math.max(onHand, 1);

  function addToCart() {
    if (!product) return;
    if (needsColour) {
      toast.warn('Choose a colour', 'Each handset is stocked by colour.');
      return;
    }
    const result = add(product, quantity, colour ?? chosen?.color ?? null);
    if (result.reason === 'insufficient-stock') {
      toast.warn('Not enough stock', `Only ${product.stock} left.`);
      return;
    }
    if (result.reason === 'partial') {
      toast.warn('Quantity reduced', `Only ${result.added} could be added.`);
      return;
    }
    toast.success('Added to cart', `${result.added} × ${product.name}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-4">
        <Link
          to="/shop"
          className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
          Back to shop
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-panel border border-hairline bg-raised">
            {images[activeImage] ? (
              <img
                src={images[activeImage]}
                alt={product.name}
                width={800}
                height={800}
                fetchPriority="high"
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center text-ink-subtle">
                <ShoppingBag aria-hidden className="h-16 w-16" />
              </div>
            )}
          </div>

          {images.length > 1 && (
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((src, index) => (
                <li key={src}>
                  <button
                    type="button"
                    onClick={() => setActiveImage(index)}
                    aria-label={`View image ${index + 1} of ${images.length}`}
                    aria-current={index === activeImage}
                    className={cn(
                      'h-16 w-16 overflow-hidden rounded-lg border-2 transition-colors',
                      index === activeImage ? 'border-brand-500' : 'border-hairline',
                    )}
                  >
                    <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {product.brand && (
            <p className="text-xs font-medium uppercase tracking-wide text-brand-400">
              {product.brand}
            </p>
          )}
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">
            {product.name}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="tabular font-display text-3xl font-bold text-ink">
              {service ? `From ${money(product.price)}` : money(product.price)}
            </p>
            {service ? (
              <Badge tone="info">Quoted at the counter</Badge>
            ) : (
              /* Exact figures are published only where captured IMEIs back
                 them; elsewhere the shop says it has the handset without
                 claiming to know how many. */
              <StockBadge
                stock={onHand}
                reorderLevel={product.reorder_level}
                showCount={serialised}
              />
            )}
          </div>
          <p className="mt-1 text-xs text-ink-subtle">
            {service
              ? 'Indicative price. The final quote depends on the handset and the parts it needs.'
              : 'VAT inclusive'}
          </p>

          {/* The one thing a customer buying an imported handset is actually
              worried about. Shown only when it is true — a trust badge on a
              product whose serials were never captured is worse than none. */}
          {!service && serialised && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-lime-500/15 px-3 py-1.5 text-xs font-medium text-brand-700">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-lime-700" />
              Each unit is logged against its IMEI before it goes on the shelf
            </p>
          )}

          {product.description && (
            <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {product.description}
            </p>
          )}

          {service ? (
            <div className="glass mt-6 rounded-2xl p-5">
              <h2 className="font-display text-base font-semibold text-ink">
                Booked in at the shop
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                Repairs are not sold online — a technician needs the handset in front of them
                before the price is real. Bring it to {STORE.address}, or call us first and we
                will tell you what to expect. You will get a job card by WhatsApp to sign and
                track.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={`tel:${STORE.phone.replace(/\s/g, '')}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-lime-500 px-6 text-sm font-semibold text-brand-800 transition-colors hover:bg-lime-400"
                >
                  <Phone aria-hidden className="h-4 w-4" />
                  {STORE.phone}
                </a>
                <Link
                  to="/support"
                  className="inline-flex h-11 items-center rounded-full border border-hairline px-6 text-sm font-medium text-ink transition-colors hover:border-brand-400"
                >
                  Ask a question
                </Link>
              </div>
            </div>
          ) : (
            <>

          {/* Colour, from the IMEI pool. Only shown when there is a choice. */}
          {serialised && stockInfo!.variants.length > 0 && (
            <fieldset className="mt-6">
              <legend className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                Colour
                {needsColour && <span className="ml-1 text-danger">*</span>}
              </legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {stockInfo!.variants.map((variant) => {
                  const active = colour === variant.color;
                  const label = variant.color ?? 'As pictured';
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setColour(variant.color);
                        setQuantity(1);
                      }}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-all',
                        active
                          ? 'border-brand-500 bg-brand-500/10 font-semibold text-brand-700'
                          : 'border-hairline text-ink-muted hover:border-brand-400 hover:text-ink',
                      )}
                    >
                      <span
                        aria-hidden
                        className="h-4 w-4 rounded-full border border-black/15"
                        style={{ background: colourSwatch(variant.color) }}
                      />
                      {label}
                      <span className="tabular text-xs text-ink-subtle">{variant.available}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-ink-subtle">
                Each handset is logged against its own IMEI, so what you see is what is on the
                shelf.
              </p>
            </fieldset>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {!outOfStock && (
              <div className="flex items-center rounded-lg border border-hairline">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                  className="p-3 text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
                >
                  <Minus aria-hidden className="h-4 w-4" />
                </button>
                <span className="tabular w-10 text-center text-sm font-medium text-ink" aria-live="polite">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity}
                  aria-label="Increase quantity"
                  className="p-3 text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
                >
                  <Plus aria-hidden className="h-4 w-4" />
                </button>
              </div>
            )}

            {outOfStock ? (
              <Button
                size="lg"
                variant="secondary"
                icon={<BellRing className="h-4 w-4" />}
                onClick={() => setAlertOpen(true)}
              >
                Notify me when it lands
              </Button>
            ) : (
              <Button
                size="lg"
                icon={<ShoppingBag className="h-4 w-4" />}
                onClick={addToCart}
                className="flex-1 sm:flex-none"
              >
                Add to cart
              </Button>
            )}
          </div>

          {product.category === 'Smartphones' && !outOfStock && (
            <div className="mt-4 rounded-card border border-hairline p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CalendarClock aria-hidden className="h-4 w-4 text-brand-400" />
                Lay-buy it over 3 months
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Pay a {money(laybyDeposit(Number(product.price)))} deposit now and the rest in your
                own time within 3 months — about{' '}
                {money(laybySuggestedInstalment(Number(product.price) - laybyDeposit(Number(product.price))))}{' '}
                a month. The phone is reserved for you and handed over once fully paid.
              </p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() =>
                  navigate(
                    `/laybuy/${product.id}${colour ? `?color=${encodeURIComponent(colour)}` : ''}`,
                  )
                }
              >
                Buy on laybuy
              </Button>
            </div>
          )}
            </>
          )}

          <ul className="mt-6 space-y-2 border-t border-hairline pt-6 text-sm text-ink-muted">
            <li className="flex items-center gap-2">
              <Truck aria-hidden className="h-4 w-4 shrink-0 text-brand-400" />
              Nationwide courier, or collect in {STORE.city}
            </li>
            <li className="flex items-center gap-2">
              <Check aria-hidden className="h-4 w-4 shrink-0 text-success" />
              Genuine imported stock, tested before dispatch
            </li>
          </ul>

          {specs.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-lg font-semibold text-ink">Specifications</h2>
              <dl className="mt-3 divide-y divide-hairline rounded-card border border-hairline">
                {specs.map((spec) => (
                  <div key={spec.label} className="grid grid-cols-3 gap-3 px-4 py-2.5 text-sm">
                    <dt className="text-ink-muted">{spec.label}</dt>
                    <dd className="col-span-2 text-ink">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>

      {related.data && related.data.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-5 font-display text-2xl font-bold tracking-tight text-ink">
            You might also like
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {related.data.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}

      <StockAlertDialog
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        productId={product.id}
        productName={product.name}
      />
    </div>
  );
}

/** Back-in-stock request. Writes to `stock_alert_requests`, which anon may insert. */
function StockAlertDialog({
  open,
  onClose,
  productId,
  productName,
}: {
  open: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!phone.trim() && !email.trim()) {
      toast.warn('Add a contact', 'We need a phone number or an email to reach you.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('stock_alert_requests').insert({
      product_id: productId,
      product_name: productName,
      customer_name: name.trim() || null,
      customer_email: email.trim().toLowerCase() || null,
      customer_phone: phone.trim() || null,
      channel: phone.trim() ? 'WhatsApp' : 'Email',
    });
    setSaving(false);

    if (error) {
      toast.error('Could not save your request', error.message);
      return;
    }
    toast.success('We will let you know', `You are on the list for ${productName}.`);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Notify me when it lands"
      description={productName}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Add me to the list
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        <Input
          label="WhatsApp number"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+264 …"
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint="Either a number or an email is enough."
        />
      </div>
    </Modal>
  );
}
