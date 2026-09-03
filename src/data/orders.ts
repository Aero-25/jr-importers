import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Json, LineItem, OrderRow } from '@/lib/database.types';
import { DEFAULT_VAT_RATE, round2, vatFromInclusive } from '@/lib/format';
import { keys } from './keys';

export interface OrderFilters {
  status?: string | null;
  statuses?: string[] | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
}

export function useOrders(filters: OrderFilters = {}) {
  return useQuery<OrderRow[], Error>({
    queryKey: keys.list('orders', filters),
    queryFn: async () => {
      let query = supabase.from('orders').select('*');

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.statuses?.length) query = query.in('status', filters.statuses);
      if (filters.from) query = query.gte('created_at', filters.from);
      if (filters.to) query = query.lte('created_at', filters.to);

      const term = filters.search?.trim().replace(/[,()]/g, ' ').trim();
      if (term) {
        query = query.or(
          ['customer_name', 'customer_email', 'customer_phone', 'payment_reference', 'waybill_number']
            .map((column) => `${column}.ilike.%${term}%`)
            .join(','),
        );
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useOrder(id: string | null | undefined) {
  return useQuery<OrderRow | null, Error>({
    queryKey: keys.detail('orders', id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').eq('id', id!).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** The signed-in shopper's own order history. RLS scopes this to them. */
export function useMyOrders(email: string | null | undefined) {
  return useQuery<OrderRow[], Error>({
    queryKey: keys.list('orders', { mine: email }),
    enabled: Boolean(email),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export interface PlaceOrderInput {
  items: LineItem[];
  customer: {
    user_id?: string | null;
    name: string;
    email: string;
    phone: string;
    city?: string | null;
    region?: string | null;
  };
  delivery: {
    method: string;
    address?: string | null;
    notes?: string | null;
  };
  payment: {
    method: string;
    reference?: string | null;
  };
  couponCode?: string | null;
  couponDiscount?: number;
  status?: string;
}

/**
 * Creates the order, then asks the database to reserve stock for it.
 *
 * The reservation is a single server-side transaction (`reserve_order_stock`)
 * rather than a client-side read-then-write, so two shoppers racing for the
 * last unit cannot both succeed. If the reservation fails the order is marked
 * cancelled and the shopper is told which line ran out.
 */
export function usePlaceOrder() {
  const qc = useQueryClient();

  return useMutation<OrderRow, Error, PlaceOrderInput>({
    mutationFn: async (input) => {
      const subtotal = round2(
        input.items.reduce((sum, line) => sum + line.price * line.quantity, 0),
      );
      const discount = round2(input.couponDiscount ?? 0);
      const total = round2(Math.max(subtotal - discount, 0));
      const { net, vat } = vatFromInclusive(total, DEFAULT_VAT_RATE);

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          user_id: input.customer.user_id ?? null,
          customer_name: input.customer.name,
          customer_email: input.customer.email.toLowerCase(),
          customer_phone: input.customer.phone,
          customer_city: input.customer.city ?? null,
          customer_region: input.customer.region ?? null,
          delivery_address: input.delivery.address ?? null,
          delivery_method: input.delivery.method,
          delivery_notes: input.delivery.notes ?? null,
          items: input.items,
          subtotal,
          subtotal_amount: net,
          vat_amount: vat,
          total_amount: total,
          coupon_code: input.couponCode ?? null,
          coupon_discount: discount || null,
          payment_method: input.payment.method,
          payment_reference: input.payment.reference ?? null,
          status: input.status ?? 'Pending',
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      const { data: reservation, error: reserveError } = await supabase.rpc(
        'reserve_order_stock',
        { p_order_id: order.id },
      );

      if (reserveError) {
        await supabase.from('orders').update({ status: 'Cancelled' }).eq('id', order.id);
        throw new Error(`Could not reserve stock: ${reserveError.message}`);
      }

      const result = reservation as { ok?: boolean; message?: string } | null;
      if (result && result.ok === false) {
        await supabase.from('orders').update({ status: 'Cancelled' }).eq('id', order.id);
        throw new Error(result.message ?? 'Some items sold out while you were checking out.');
      }

      return order;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.table('orders') });
      void qc.invalidateQueries({ queryKey: keys.table('products') });
    },
  });
}

/** Status transition from the console. Releases stock when an order is cancelled. */
export function useUpdateOrder() {
  const qc = useQueryClient();

  return useMutation<
    OrderRow,
    Error,
    { id: string; values: Partial<OrderRow>; releaseStock?: boolean }
  >({
    mutationFn: async ({ id, values, releaseStock }) => {
      if (releaseStock) {
        const { error: releaseError } = await supabase.rpc('release_order_stock', {
          p_order_id: id,
        });
        if (releaseError) throw new Error(releaseError.message);
      }

      const { data, error } = await supabase
        .from('orders')
        .update(values)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.table('orders') });
      void qc.invalidateQueries({ queryKey: keys.table('products') });
    },
  });
}

export interface CouponResult {
  valid: boolean;
  message?: string;
  code?: string;
  discount_amount?: number;
  discount_type?: string;
  discount_value?: number;
}

/**
 * Validates a coupon server-side.
 *
 * Never compute the discount in the browser: the rules (expiry, usage cap,
 * minimum spend) live in `public.validate_coupon` where they cannot be edited
 * by whoever is holding the page.
 */
export function useValidateCoupon() {
  return useMutation<
    CouponResult,
    Error,
    { code: string; cartTotal: number; items?: Array<Record<string, unknown>> }
  >({
    mutationFn: async ({ code, cartTotal, items }) => {
      // The basket goes with the code: a coupon scoped to named products can
      // only be judged against what is actually being bought, and that
      // decision has to stay on the server.
      const { data, error } = await supabase.rpc('validate_coupon', {
        p_code: code,
        p_cart_total: cartTotal,
        p_items: (items ?? null) as never,
      });
      if (error) throw new Error(error.message);
      return (data ?? { valid: false, message: 'Coupon could not be checked.' }) as unknown as CouponResult;
    },
  });
}

/** Records that a coupon was actually redeemed, once the order exists. */
export async function logCouponUsage(params: {
  code: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  discount: number;
  orderTotal: number;
}): Promise<void> {
  await supabase.from('coupon_usage').insert({
    coupon_code: params.code,
    order_id: params.orderId,
    customer_name: params.customerName,
    customer_email: params.customerEmail,
    discount_amount: params.discount,
    order_total: params.orderTotal,
  });
}

export function orderItems(order: Pick<OrderRow, 'items'>): LineItem[] {
  const raw = order.items as unknown as Json;
  return Array.isArray(raw) ? (raw as unknown as LineItem[]) : [];
}
