import type { TableName } from '@/lib/database.types';

/**
 * Query-key factory.
 *
 * Every key starts with the table name so a mutation can invalidate a whole
 * table with `queryClient.invalidateQueries({ queryKey: keys.table(t) })`
 * without knowing which filtered lists happen to be mounted.
 */
export const keys = {
  table: (table: TableName): unknown[] => [table],
  list: (table: TableName, filters?: unknown): unknown[] =>
    filters === undefined ? [table, 'list'] : [table, 'list', filters],
  detail: (table: TableName, id: string | number): unknown[] => [table, 'detail', id],

  // Derived views that do not map 1:1 onto a table.
  dashboard: (range: string): unknown[] => ['dashboard', range],
  productFacets: (): unknown[] => ['products', 'facets'],
  openTill: (): unknown[] => ['till_shifts', 'open'],
  ledgerBalance: (kind: 'debtor' | 'creditor', partyId: string | number): unknown[] => [
    'account_transactions',
    'balance',
    kind,
    partyId,
  ],
};
