import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { keys } from './keys';

export interface SalesProfit {
  ok: boolean;
  revenue_inc: number;
  revenue_net: number;
  cost_of_sales: number;
  gross_profit: number;
  margin_pct: number;
  refunds: number;
  order_count: number;
  /** How much of the figure is exact: lines with no cost are valued at zero. */
  total_lines: number;
  costed_lines: number;
  top_products: Array<{ name: string; units: number; profit: number }>;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Gross profit for a period.
 *
 * Computed in Postgres because it expands every line of every order in the
 * range and joins each to its product — work that would mean shipping the whole
 * sales history to the browser to render four numbers.
 */
export function useSalesProfit(from: Date, to: Date, label: string) {
  return useQuery<SalesProfit, Error>({
    queryKey: keys.dashboard(`profit-${label}`),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sales_profit', {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw new Error(error.message);

      const result = data as unknown as SalesProfit & { message?: string };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not work out the profit.');
      return result;
    },
  });
}
