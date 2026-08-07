import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';

/**
 * Pager for server-side lists.
 *
 * States the total rather than only the page, because the number that matters
 * to somebody searching is how many matched — a list that shows fifty rows and
 * says nothing about the other four hundred reads as an answer.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  if (total <= pageSize) {
    return (
      <p className={cn('tabular px-4 py-2.5 text-xs text-ink-subtle', className)}>
        {total} {total === 1 ? 'row' : 'rows'}
      </p>
    );
  }

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', className)}
    >
      <p className="tabular text-xs text-ink-muted">
        {first}–{last} of <strong className="text-ink">{total}</strong>
      </p>

      <div className="ml-auto flex items-center gap-1">
        <IconButton
          label="Previous page"
          size="sm"
          variant="ghost"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          icon={<ChevronLeft className="h-4 w-4" />}
        />
        <span className="tabular px-2 text-xs text-ink-muted">
          {page + 1} / {pages}
        </span>
        <IconButton
          label="Next page"
          size="sm"
          variant="ghost"
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
          icon={<ChevronRight className="h-4 w-4" />}
        />
      </div>
    </nav>
  );
}
