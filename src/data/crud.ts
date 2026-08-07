import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Insert, Row, TableName, Update } from '@/lib/database.types';
import { keys } from './keys';

/**
 * supabase-js resolves its result types through conditional types keyed on a
 * literal table name. When the name is a bare generic parameter those
 * conditionals cannot reduce, and every call collapses to `never`.
 *
 * This factory therefore talks to an untyped handle internally and re-applies
 * `Row<T>` / `Insert<T>` at the boundary. Callers still get full per-table
 * types; only these few lines are loose, and they are covered by the argument
 * types on the exported hooks.
 */
const db = supabase as unknown as SupabaseClient;

export interface ListOptions<T extends TableName> {
  /** Equality filters. `undefined` and `null` values are skipped. */
  eq?: Partial<Record<keyof Row<T> & string, string | number | boolean | null | undefined>>;
  /** `ilike '%term%'` across the listed columns, OR-ed together. */
  search?: { term: string; columns: Array<keyof Row<T> & string> };
  orderBy?: { column: keyof Row<T> & string; ascending?: boolean };
  limit?: number;
  /** Postgres range, inclusive both ends. */
  range?: { from: number; to: number };
  select?: string;
}

/** One page of rows plus the total the filters match. */
export interface Page<T> {
  rows: T[];
  total: number;
}

/**
 * Applies the shared filters. Split out so the list and the paged read cannot
 * drift apart — a count that filters differently to the rows it counts is worse
 * than no count.
 */
function applyFilters<T extends TableName>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  options: ListOptions<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  for (const [column, value] of Object.entries(options.eq ?? {})) {
    if (value !== undefined && value !== null) query = query.eq(column, value);
  }

  const term = options.search?.term.trim();
  if (term && options.search) {
    const safe = term.replace(/[,()]/g, ' ').trim();
    if (safe) {
      query = query.or(options.search.columns.map((c) => `${c}.ilike.%${safe}%`).join(','));
    }
  }
  return query;
}

/**
 * Reads one page, and how many rows there are in total.
 *
 * Counting is what makes paging honest. Without it a list can only say "here
 * are 500 rows" and stay silent about the rest, which reads as an answer rather
 * than a truncation — the worst way for a list to fail.
 */
async function fetchPage<T extends TableName>(
  table: T,
  options: ListOptions<T>,
  page: number,
  pageSize: number,
): Promise<Page<Row<T>>> {
  const from = Math.max(0, page) * pageSize;

  let query = db.from(table).select(options.select ?? '*', { count: 'exact' });
  query = applyFilters(query, options);

  if (options.orderBy) {
    query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
  }

  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);

  return { rows: (data ?? []) as unknown as Row<T>[], total: count ?? 0 };
}

async function fetchList<T extends TableName>(
  table: T,
  options: ListOptions<T> = {},
): Promise<Row<T>[]> {
  let query = db.from(table).select(options.select ?? '*');

  // PostgREST `or` takes a comma-joined filter list, so commas and parens
  // inside a search term have to be stripped or they break out of the grammar.
  query = applyFilters(query, options);

  if (options.orderBy) {
    query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
  }
  if (options.range) {
    query = query.range(options.range.from, options.range.to);
  } else if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Row<T>[];
}

/**
 * Builds the standard hook set for a table.
 *
 * Most console modules need exactly list/detail/create/update/remove against
 * one table with no bespoke logic; those get this. Anything with real domain
 * rules (stock, tills, orders) gets a hand-written module instead.
 */
export function createResource<T extends TableName>(table: T, defaults: ListOptions<T> = {}) {
  function useList(
    options: ListOptions<T> = {},
    queryOptions?: Partial<UseQueryOptions<Row<T>[], Error>>,
  ) {
    const merged = { ...defaults, ...options };
    return useQuery<Row<T>[], Error>({
      queryKey: keys.list(table, merged),
      queryFn: () => fetchList(table, merged),
      ...queryOptions,
    });
  }

  /** Server-side paging. Rows and the matching total come back together. */
  function usePage(options: ListOptions<T> = {}, page = 0, pageSize = 50) {
    const merged = { ...defaults, ...options };
    return useQuery<Page<Row<T>>, Error>({
      queryKey: keys.list(table, { ...merged, page, pageSize }),
      queryFn: () => fetchPage(table, merged, page, pageSize),
      // Keeps the previous page on screen while the next loads, so paging does
      // not flash an empty table.
      placeholderData: (previous) => previous,
    });
  }

  function useDetail(id: string | number | null | undefined) {
    return useQuery<Row<T> | null, Error>({
      queryKey: keys.detail(table, id ?? ''),
      enabled: id !== null && id !== undefined && id !== '',
      queryFn: async () => {
        const { data, error } = await db
          .from(table)
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data as Row<T> | null;
      },
    });
  }

  function useCreate() {
    const qc = useQueryClient();
    return useMutation<Row<T>, Error, Insert<T>>({
      mutationFn: async (values) => {
        const { data, error } = await db
          .from(table)
          .insert(values)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as Row<T>;
      },
      onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table(table) }),
    });
  }

  function useUpdate() {
    const qc = useQueryClient();
    return useMutation<Row<T>, Error, { id: string | number; values: Update<T> }>({
      mutationFn: async ({ id, values }) => {
        const { data, error } = await db
          .from(table)
          .update(values)
          .eq('id', id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as Row<T>;
      },
      onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table(table) }),
    });
  }

  function useRemove() {
    const qc = useQueryClient();
    return useMutation<void, Error, string | number>({
      mutationFn: async (id) => {
        const { error } = await db
          .from(table)
          .delete()
          .eq('id', id);
        if (error) throw new Error(error.message);
      },
      onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table(table) }),
    });
  }

  return { table, useList, usePage, useDetail, useCreate, useUpdate, useRemove, fetchList, fetchPage };
}
