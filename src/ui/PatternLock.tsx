import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Android unlock-pattern capture — the 3×3 dot grid printed on the job card.
 *
 * Stored as hyphen-joined dot indices (`1-2-5-8-9`), numbered left-to-right,
 * top-to-bottom. That is compact, human-readable on a printed card, and
 * re-drawable, which a screenshot would not be.
 */
export function PatternLock({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (pattern: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [drawing, setDrawing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const dots = value ? value.split('-').filter(Boolean).map(Number) : [];

  const addDot = useCallback(
    (dot: number) => {
      // A pattern cannot reuse a dot, which is also what Android enforces.
      if (dots.includes(dot)) return;
      const next = [...dots];
      const last = next[next.length - 1];
      // Android auto-selects an unvisited dot that lies directly between the
      // last dot and this one (1→9 passes through 5, 1→3 through 2). Without
      // mirroring that, a fast diagonal stroke records a pattern that cannot
      // be drawn on the handset it is meant to unlock.
      if (last !== undefined) {
        const r1 = Math.floor((last - 1) / 3);
        const c1 = (last - 1) % 3;
        const r2 = Math.floor((dot - 1) / 3);
        const c2 = (dot - 1) % 3;
        if ((r1 + r2) % 2 === 0 && (c1 + c2) % 2 === 0) {
          const mid = ((r1 + r2) / 2) * 3 + (c1 + c2) / 2 + 1;
          if (mid !== last && mid !== dot && !next.includes(mid)) next.push(mid);
        }
      }
      next.push(dot);
      onChange(next.join('-'));
    },
    [dots, onChange],
  );

  /** Translates a pointer position to the dot under it, if any. */
  const dotAtPoint = useCallback((clientX: number, clientY: number): number | null => {
    const container = containerRef.current;
    if (!container) return null;

    for (const node of Array.from(container.querySelectorAll<HTMLElement>('[data-dot]'))) {
      const rect = node.getBoundingClientRect();
      // Generous hit radius: fingers are imprecise on a counter tablet.
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = rect.width * 0.9;
      if ((clientX - cx) ** 2 + (clientY - cy) ** 2 <= radius ** 2) {
        return Number(node.dataset.dot);
      }
    }
    return null;
  }, []);

  useEffect(() => {
    if (!drawing) return;

    const onMove = (event: PointerEvent) => {
      const dot = dotAtPoint(event.clientX, event.clientY);
      if (dot !== null) addDot(dot);
    };
    const onUp = () => setDrawing(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drawing, dotAtPoint, addDot]);

  // Geometry for the connecting lines, in the 0–100 viewBox space.
  const position = (dot: number) => ({
    x: ((dot - 1) % 3) * 40 + 10,
    y: Math.floor((dot - 1) / 3) * 40 + 10,
  });

  return (
    <div className={cn('inline-block', className)}>
      <div
        ref={containerRef}
        className={cn(
          'relative select-none rounded-lg border border-hairline bg-surface p-3',
          disabled && 'opacity-60',
        )}
        style={{ touchAction: 'none' }}
        onPointerDown={() => !disabled && setDrawing(true)}
      >
        <svg
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]"
          aria-hidden
        >
          {dots.slice(1).map((dot, index) => {
            const from = position(dots[index]!);
            const to = position(dot);
            return (
              <line
                key={`${dots[index]}-${dot}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgb(var(--c-brand-500))"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((dot) => {
            const order = dots.indexOf(dot);
            const active = order !== -1;
            return (
              <button
                key={dot}
                type="button"
                data-dot={dot}
                disabled={disabled}
                aria-label={`Dot ${dot}${active ? `, position ${order + 1}` : ''}`}
                aria-pressed={active}
                onPointerDown={() => !disabled && addDot(dot)}
                onClick={() => !disabled && addDot(dot)}
                className={cn(
                  'relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors',
                  active
                    ? 'border-brand-500 bg-brand-500 text-2xs font-bold text-white'
                    : 'border-hairline bg-canvas hover:border-brand-400',
                )}
              >
                {active ? order + 1 : ''}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <code className="font-mono text-xs text-ink-muted">{value || 'no pattern'}</code>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-ink-subtle underline hover:text-danger"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/** Read-only rendering of a stored pattern, for the PDF preview and print view. */
export function PatternPreview({ value, size = 72 }: { value: string; size?: number }) {
  const dots = value ? value.split('-').filter(Boolean).map(Number) : [];
  const position = (dot: number) => ({
    x: ((dot - 1) % 3) * 40 + 10,
    y: Math.floor((dot - 1) / 3) * 40 + 10,
  });

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Pattern ${value}`}>
      {dots.slice(1).map((dot, index) => {
        const from = position(dots[index]!);
        const to = position(dot);
        return (
          <line
            key={`${dots[index]}-${dot}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((dot) => {
        const p = position(dot);
        return (
          <circle
            key={dot}
            cx={p.x}
            cy={p.y}
            r={dots.includes(dot) ? 6 : 4}
            fill={dots.includes(dot) ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}
