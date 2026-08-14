import { Check } from 'lucide-react';
import { HeroMark } from './HeroMark';

/**
 * The hero scene: the mark, grounded in the thing the headline claims.
 *
 * "Checked before it's yours" is the counter's bench test, so the scene shows
 * one happening: a job-card-styled check sheet floating in front of the mark,
 * ticking itself off row by row and landing on PASSED. The rows mirror the
 * printed bench checklist on the repair job card (JOB_CARD_CHECKS), in the
 * words a shopper would use rather than the technician's shorthand.
 *
 * Decorative throughout — aria-hidden, with the same promise carried by the
 * hero's real text. Every animation here is CSS; the only JS on this path is
 * HeroMark's pointer tracking, which already respects reduced motion.
 */

const BENCH_CHECKS = ['LCD & touch', 'Battery & charge', 'Cameras & mic', 'IMEI verified'];

/** Seconds before the first row ticks; rows follow at this interval. */
const TICK_START = 0.7;
const TICK_STEP = 0.3;

export function HeroScene() {
  return (
    <div aria-hidden className="relative">
      {/* Workshop texture, tucked behind the mark's shoulder. */}
      <div className="hero-dots absolute right-[3%] top-[5%] h-[46%] w-[44%]" />

      {/* A calibration ring around the rig. It turns far too slowly to watch,
          which is the point — it reads as instrumentation, not decoration. */}
      <div className="absolute left-1/2 top-1/2 aspect-square h-[88%] -translate-x-1/2 -translate-y-1/2">
        <div className="hero-orbit h-full w-full rounded-full border border-dashed border-brand-200" />
      </div>

      <HeroMark />

      {/* The bench card, floating in front of the mark's lower shoulder. */}
      <div className="absolute bottom-[3%] left-2 z-10 sm:bottom-[6%] sm:left-[4%]">
        <div className="hero-float">
          <div className="glass relative w-44 -rotate-6 rounded-2xl p-3.5 sm:w-48">
            <div className="flex items-baseline justify-between font-mono text-2xs">
              <span className="font-bold tracking-[0.14em] text-ink">BENCH TEST</span>
              <span className="text-ink-subtle">JR-0284</span>
            </div>

            <ul className="mt-2.5 space-y-1.5 border-t border-hairline pt-2.5">
              {BENCH_CHECKS.map((label, index) => (
                <li
                  key={label}
                  className="bench-tick flex items-center justify-between font-mono text-2xs text-ink-muted"
                  style={{ animationDelay: `${TICK_START + index * TICK_STEP}s` }}
                >
                  {label}
                  <Check className="h-3 w-3 text-success" strokeWidth={3} />
                </li>
              ))}
            </ul>

            {/* Lands last, once every row has ticked. Its resting rotation
                lives in the keyframe, not a class — a `both` fill would
                override any class transform anyway. */}
            <span
              className="bench-stamp absolute -right-3.5 -top-3.5 rounded-md border-2 border-success/70 bg-surface/85 px-2 py-0.5 font-mono text-2xs font-bold tracking-[0.18em] text-success"
              style={{ animationDelay: `${TICK_START + BENCH_CHECKS.length * TICK_STEP + 0.15}s` }}
            >
              PASSED
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
