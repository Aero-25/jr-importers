import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

/** Single source of truth for the reduced-motion preference. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Pointer-tracked specular highlight for a `.glass.sheen` panel.
 *
 * Writes the pointer position to `--mx` / `--my` so CSS paints the highlight.
 * Updates are coalesced into one write per animation frame — a pointermove
 * fires far more often than the screen refreshes, and setting a custom
 * property invalidates style on every call.
 */
export function useSpecular<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const frame = useRef(0);
  const next = useRef({ x: 50, y: 0 });

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    if (prefersReducedMotion()) return;

    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    next.current = {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };

    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      el.style.setProperty('--mx', `${next.current.x}%`);
      el.style.setProperty('--my', `${next.current.y}%`);
    });
  }, []);

  const onPointerLeave = useCallback((event: ReactPointerEvent<T>) => {
    event.currentTarget.style.removeProperty('--mx');
    event.currentTarget.style.removeProperty('--my');
  }, []);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return { ref, specularProps: { onPointerMove, onPointerLeave } };
}

/**
 * Reveals `.reveal` descendants as they enter the viewport.
 *
 * One-shot per element: once revealed the observer stops watching it, so
 * nothing re-animates on the way back up — which is where scroll effects
 * usually stop being pleasant.
 *
 * Attach to a container; every `.reveal` inside it is observed.
 */
export function useReveal<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));
    if (targets.length === 0) return;

    // Without motion, show everything immediately rather than leaving it at
    // opacity 0 — the CSS override handles paint, this handles the observer.
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          // Stagger by position within its own group, capped so a long grid
          // never leaves the last card waiting seconds to appear.
          const delay = Math.min(Number(el.dataset.revealIndex ?? 0), 7) * 60;
          el.style.transitionDelay = `${delay}ms`;
          el.classList.add('is-in');
          observer.unobserve(el);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

/**
 * Parallax offset for the hero, in pixels, driven by scroll depth.
 * Returns a ref to attach; writes `--parallax` on the element.
 */
export function useParallax<T extends HTMLElement>(strength = 0.18) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Only while the hero is still on screen; past that it is wasted work.
        const offset = Math.min(window.scrollY, window.innerHeight);
        el.style.setProperty('--parallax', `${offset * strength}px`);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [strength]);

  return ref;
}
