import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * The hero mark, watching the cursor.
 *
 * Replaces the three.js scene that used to write the name here. That cost
 * 171 KB gzipped to run once and then sit still; this is a transform on an
 * image the page already loads, and it keeps responding for as long as someone
 * is on the page. On a phone connection that trade is not close.
 *
 * The tracking is deliberately unbounded by hover: the mark turns towards the
 * pointer wherever it is on the page, so it reads as watching rather than as a
 * hover effect that happens to be nearby.
 */

/**
 * How far it turns.
 *
 * A flat image cannot actually rotate, so this pairs a large rotateY with a
 * matching horizontal squeeze: turning away foreshortens what you see, and it
 * is the squeeze rather than the rotation that reads as a body turning. Without
 * it, anything past about 20 degrees just looks sheared.
 */
const MAX_YAW = 34;
const MAX_PITCH = 16;
/** A little lean into the turn, the way a person shifts weight to look. */
const MAX_LEAN = 5;
/** Parallax on the layers, in pixels at full deflection. */
const GLOW_SHIFT = 26;
const MARK_SHIFT = 10;
/** Approach rate per frame. Lower is heavier; this settles in ~15 frames. */
const EASE = 0.09;

export function HeroMark({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLImageElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const mark = markRef.current;
    const glow = glowRef.current;
    const sheen = sheenRef.current;
    if (!root || !mark || !glow || !sheen) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    // A touch device has no cursor to face. Rather than leave it inert, the
    // idle drift below keeps it alive without pretending to track anything.
    const fine = window.matchMedia('(pointer: fine)');

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    let idle = true;

    function onPointerMove(event: PointerEvent) {
      const box = root!.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;

      // Normalised to roughly [-1, 1] against half the viewport, so the mark is
      // at full deflection when the pointer reaches the edge of the screen
      // rather than the edge of its own box.
      // Deflection is measured against a radius a little tighter than half the
      // viewport, so the mark reaches a full turn well before the pointer gets
      // to the edge of the screen rather than only at the very corner.
      targetX = Math.max(-1, Math.min(1, (event.clientX - cx) / (window.innerWidth * 0.34)));
      targetY = Math.max(-1, Math.min(1, (event.clientY - cy) / (window.innerHeight * 0.42)));
      idle = false;
    }

    function tick(time: number) {
      if (idle) {
        // A slow lissajous drift so it is never completely static — the same
        // shape a head makes when someone is looking around a room.
        targetX = Math.sin(time / 2600) * 0.45;
        targetY = Math.sin(time / 3700) * 0.3;
      }

      x += (targetX - x) * EASE;
      y += (targetY - y) * EASE;

      // Y drives rotateX inverted: pointer below centre should tip the mark
      // towards the viewer's chin, not away from it.
      const yaw = x * MAX_YAW;
      // cos of the yaw is how wide a real object would look once turned. The
      // mark keeps a floor of 0.8 so it never squashes into a sliver.
      const squeeze = Math.max(0.8, Math.cos((yaw * Math.PI) / 180));

      mark!.style.transform =
        `translate3d(${(-x * MARK_SHIFT).toFixed(2)}px, ${(-y * MARK_SHIFT).toFixed(2)}px, 0) ` +
        `rotateY(${yaw.toFixed(2)}deg) ` +
        `rotateX(${(-y * MAX_PITCH).toFixed(2)}deg) ` +
        `rotateZ(${(x * MAX_LEAN).toFixed(2)}deg) ` +
        `scaleX(${squeeze.toFixed(3)})`;

      glow!.style.transform =
        `translate3d(${(x * GLOW_SHIFT).toFixed(2)}px, ${(y * GLOW_SHIFT).toFixed(2)}px, 0)`;

      // The highlight slides across the mark from the side the pointer is on,
      // which is what sells the tilt as a solid object catching light.
      sheen!.style.background =
        `radial-gradient(38% 46% at ${(50 + x * 34).toFixed(1)}% ${(38 + y * 26).toFixed(1)}%, ` +
        `rgb(255 255 255 / 0.5), transparent 70%)`;

      frame = requestAnimationFrame(tick);
    }

    if (still.matches) {
      // Centred, lit from the front, and left alone.
      mark.style.transform = 'none';
      sheen.style.background =
        'radial-gradient(38% 46% at 50% 38%, rgb(255 255 255 / 0.4), transparent 70%)';
      return;
    }

    if (fine.matches) window.addEventListener('pointermove', onPointerMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={cn(
        'relative flex h-[320px] items-center justify-center sm:h-[400px] lg:h-[480px]',
        className,
      )}
      style={{ perspective: '900px' }}
    >
      {/* The colour it stands on. Drifts opposite the mark, which reads as
          depth without needing a second image. */}
      <div
        ref={glowRef}
        className="pointer-events-none absolute h-[62%] w-[62%] rounded-full will-change-transform"
        style={{
          background:
            'radial-gradient(circle, rgb(163 230 53 / 0.45) 0%, rgb(101 212 30 / 0.22) 45%, transparent 72%)',
          filter: 'blur(38px)',
        }}
      />

      {/* A faint ring, so the mark sits in something rather than floating. */}
      <div
        className="pointer-events-none absolute aspect-square h-[76%] rounded-full border border-lime-500/25"
        style={{ boxShadow: 'inset 0 0 60px rgb(163 230 53 / 0.14)' }}
      />

      <div className="relative h-[74%] will-change-transform" style={{ transformStyle: 'preserve-3d' }}>
        <img
          ref={markRef}
          src="/logo-mark.png"
          alt=""
          data-hero-mark
          width={133}
          height={240}
          className="h-full w-auto select-none will-change-transform"
          style={{
            filter: 'drop-shadow(0 26px 42px rgb(21 61 41 / 0.35))',
            transition: 'none',
          }}
          draggable={false}
        />

        {/* Specular pass, masked to the mark so the highlight lands on the
            robot and not on the box around it. */}
        <div
          ref={sheenRef}
          className="pointer-events-none absolute inset-0"
          style={{
            WebkitMaskImage: 'url(/logo-mark.png)',
            maskImage: 'url(/logo-mark.png)',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            mixBlendMode: 'soft-light',
          }}
        />
      </div>
    </div>
  );
}
