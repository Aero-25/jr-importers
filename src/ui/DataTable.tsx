import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EmptyState, Skeleton } from './feedback';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Return a comparable primitive to make the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  /** Hidden below `md`. Use for columns that are context, not the point. */
  secondary?: boolean;
  width?: string;
  className?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  empty?: { title: string; message?: string; action?: ReactNode };
  /** Column key to sort by initially. */
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  /** Rendered under the last row — totals, pagination. */
  footer?: ReactNode;
  className?: string;
  dense?: boolean;
}

/**
 * Sortable table for console modules.
 *
 * Sorting is client-side and intentionally so: every list here is scoped to a
 * single store's working set. If a table outgrows that, move ordering into the
 * query rather than paginating this component.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  onRowClick,
  empty,
  defaultSort,
  footer,
  className,
  dense = false,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;

    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), 'en', { numeric: true }) * factor;
    });
  }, [rows, columns, sort]);

  function toggleSort(column: Column<T>) {
    if (!column.sortValue) return;
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: 'asc' },
    );
  }

  const cellPad = dense ? 'px-3 py-1.5' : 'px-4 py-3';
  const alignOf = (a?: Column<T>['align']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  if (loading) {
    return (
      <div className={cn('space-y-2 p-4', className)}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        title={empty?.title ?? 'Nothing here yet'}
        message={empty?.message}
        action={empty?.action}
        className={className}
      />
    );
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((column) => {
              const isSorted = sort?.key === column.key;
              const sortable = Boolean(column.sortValue);
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={
                    isSorted ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  className={cn(
                    cellPad,
                    alignOf(column.align),
                    'text-xs font-semibold uppercase tracking-wide text-ink-muted',
                    column.secondary && 'hidden md:table-cell',
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-ink',
                        column.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {column.header}
                      <span aria-hidden>
                        {!isSorted ? (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        ) : sort!.direction === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter') onRowClick(row);
                    }
                  : undefined
              }
              className={cn(
                'border-b border-hairline/60 transition-colors last:border-0',
                onRowClick && 'cursor-pointer hover:bg-raised focus:bg-raised',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    cellPad,
                    alignOf(column.align),
                    'text-ink',
                    column.secondary && 'hidden md:table-cell',
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="border-t-2 border-hairline">
            <tr>
              <td colSpan={columns.length} className={cellPad}>
                {footer}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
