import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Lock, Tag } from 'lucide-react';
import { useCart, useCartTotals } from '@/data/cart';
import { logCouponUsage, usePlaceOrder, useValidateCoupon } from '@/data/orders';
import { useAuth } from '@/auth/AuthProvider';
import { DELIVERY_METHODS } from '@/lib/constants';
import { money } from '@/lib/format';
import { Button, Card, Input, Notice, Select, Textarea, useToast } from '@/ui';
import { useSeo } from '../seo';

const NAMIBIAN_REGIONS = [
  'Khomas',
  'Erongo',
  'Oshana',
  'Ohangwena',
  'Omusati',
  'Oshikoto',
  'Otjozondjupa',
  'Hardap',
  '//Karas',
  'Kavango East',
  'Kavango West',
  'Kunene',
  'Omaheke',
  'Zambezi',
];

export default function Checkout() {
  useSeo({ title: 'Checkout', path: '/checkout', noIndex: true });

  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, isAuthenticated } = useAuth();
  const { lines, clear } = useCart();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('Khomas');
  const [deliveryMethod, setDeliveryMethod] = useState<string>(DELIVERY_METHODS[0]);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('EFT');

  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);

  const totals = useCartTotals(lines, discount);
  const placeOrder = usePlaceOrder();
  const validateCoupon = useValidateCoupon();

  // Prefill from the signed-in profile, without clobbering typing in progress.
  useEffect(() => {
    if (profile?.full_name && !name) setName(profile.full_name);
    if (profile?.email && !email) setEmail(profile.email);
    if (profile?.phone && !phone) setPhone(profile.phone);
  }, [profile, name, email, phone]);

  if (lines.length === 0 && !placeOrder.isSuccess) {
    return <Navigate to="/cart" replace />;
  }

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) return;

    try {
      const result = await validateCoupon.mutateAsync({ code, cartTotal: totals.subtotal });
      if (!result.valid) {
        toast.warn('Coupon not applied', result.message ?? 'That code is not valid.');
        setDiscount(0);
        setAppliedCoupon(null);
        return;
      }
      setDiscount(Number(result.discount_amount ?? 0));
      setAppliedCoupon(result.code ?? code);
      toast.success('Coupon applied', `You saved ${money(result.discount_amount ?? 0)}.`);
    } catch (error) {
      toast.error('Could not check that coupon', error instanceof Error ? error.message : undefined);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!isAuthenticated) {
      toast.warn('Sign in to continue', 'Orders are tied to an account so you can track them.');
      navigate('/account/sign-in?next=/checkout');
      return;
    }
    if (deliveryMethod !== 'Collection' && !address.trim()) {
      toast.warn('Delivery address needed', 'Add where we should send the order.');
      return;
    }

    try {
      const order = await placeOrder.mutateAsync({
        items: lines.map((line) => ({
          product_id: line.product_id,
          name: line.name,
          sku: line.sku,
          price: line.price,
          quantity: line.quantity,
          color: line.color,
          line_total: line.price * line.quantity,
        })),
        customer: {
          user_id: user?.id ?? null,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          city: city.trim() || null,
          region,
        },
        delivery: {
          method: deliveryMethod,
          address: deliveryMethod === 'Collection' ? null : address.trim(),
          notes: notes.trim() || null,
        },
        payment: { method: paymentMethod },
        couponCode: appliedCoupon,
        couponDiscount: discount,
      });

      if (appliedCoupon) {
        // Best-effort: a failed usage log must not undo a successful order.
        void logCouponUsage({
          code: appliedCoupon,
          orderId: order.id,
          customerName: name.trim(),
          customerEmail: email.trim(),
          discount,
          orderTotal: totals.total,
        });
      }

      clear();
      navigate(`/order/${order.id}`, { replace: true });
    } catch (error) {
      toast.error(
        'Order could not be placed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Checkout</h1>

      {!isAuthenticated && (
        <Notice tone="info" className="mt-4" title="Sign in to place your order">
          Orders are linked to an account so you can track them and we can reach you about
          delivery.
        </Notice>
      )}

      <form onSubmit={submit} className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Your details</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                label="Full name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
              <Input
                label="Phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="+264 …"
              />
              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                containerClassName="sm:col-span-2"
              />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Delivery</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Select
                label="Method"
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value)}
                options={DELIVERY_METHODS.map((m) => ({ value: m, label: m }))}
              />
              <Select
                label="Region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                options={NAMIBIAN_REGIONS}
              />
              <Input
                label="Town / city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="address-level2"
              />
              {deliveryMethod !== 'Collection' && (
                <Input
                  label="Delivery address"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  autoComplete="street-address"
                  containerClassName="sm:col-span-2"
                />
              )}
              <Textarea
                label="Notes for us"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Gate code, landmark, preferred delivery time…"
                className="sm:col-span-2"
              />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Payment</h2>
            <p className="mt-1 text-sm text-ink-muted">
              We confirm your order first, then send payment details. Nothing is charged now.
            </p>
            <Select
              label="Preferred method"
              className="mt-3"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              options={['EFT', 'Card on collection', 'Cash on collection', 'Layby']}
            />
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Order summary</h2>

            <ul className="mt-4 space-y-2 border-b border-hairline pb-4">
              {lines.map((line) => (
                <li
                  key={`${line.product_id}-${line.color ?? ''}`}
                  className="flex justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 text-ink-muted">
                    <span className="tabular">{line.quantity}×</span>{' '}
                    <span className="text-ink">{line.name}</span>
                  </span>
                  <span className="tabular shrink-0 text-ink">
                    {money(line.price * line.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex gap-2">
              <Input
                label="Coupon"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                leading={<Tag className="h-4 w-4" />}
                containerClassName="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                className="mt-6 self-start"
                onClick={applyCoupon}
                loading={validateCoupon.isPending}
              >
                Apply
              </Button>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular text-ink">{money(totals.subtotal)}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-success">
                  <dt>Discount {appliedCoupon && `(${appliedCoupon})`}</dt>
                  <dd className="tabular">−{money(totals.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-hairline pt-2 text-base font-semibold">
                <dt className="text-ink">Total</dt>
                <dd className="tabular text-ink">{money(totals.total)}</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-ink-subtle">Includes VAT</dt>
                <dd className="tabular text-ink-subtle">{money(totals.vat)}</dd>
              </div>
            </dl>

            <Button
              type="submit"
              fullWidth
              size="lg"
              className="mt-5"
              loading={placeOrder.isPending}
              icon={<Lock className="h-4 w-4" />}
            >
              Place order
            </Button>

            <p className="mt-3 text-center text-xs text-ink-subtle">
              Stock is held for 30 minutes once your order is confirmed.
            </p>
          </Card>
        </aside>
      </form>
    </div>
  );
}
