import { Link } from 'react-router-dom';
import { BatteryCharging, Phone, ShieldCheck, Smartphone } from 'lucide-react';
import { STORE } from '@/lib/constants';
import { useSpecular } from '@/ui/effects';

const JOBS = [
  { icon: Smartphone, label: 'Screen replacement' },
  { icon: BatteryCharging, label: 'Battery replacement' },
  { icon: ShieldCheck, label: 'Data recovery' },
];

/**
 * Repairs, advertised rather than sold.
 *
 * There is deliberately no repairs page and no repair listing: a repair cannot
 * be shipped, and cannot be priced until a technician has the handset in front
 * of them. So this band sits above the footer on every page and does the one
 * thing it should — get the customer to the counter or on the phone.
 */
export function RepairsBand() {
  const { specularProps } = useSpecular<HTMLDivElement>();

  return (
    <section className="relative z-10 mx-auto max-w-7xl px-4 pb-14 pt-4">
      <div
        {...specularProps}
        className="glass sheen flex flex-col gap-7 rounded-3xl p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-lime-700">
            In-house workshop
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-brand-700 sm:text-3xl">
            Cracked screen? Battery flat by lunchtime?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">
            Bring the handset to {STORE.address} and we will look at it while you wait. You get a
            job card by WhatsApp — sign it on your phone, track the repair, and collect when it is
            ready.
          </p>

          <ul className="mt-5 flex flex-wrap gap-2">
            {JOBS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/70 px-3.5 py-1.5 text-xs font-medium text-ink"
              >
                <Icon aria-hidden className="h-3.5 w-3.5 text-lime-700" />
                {label}
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-ink-subtle">
            Repairs are quoted at the counter. Anything over N$350 is confirmed with you before we
            start.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
          <a
            href={`tel:${STORE.phone.replace(/\s/g, '')}`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-lime-500 px-7 text-base font-semibold text-brand-800 shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] transition-colors hover:bg-lime-400"
          >
            <Phone aria-hidden className="h-4 w-4" />
            {STORE.phone}
          </a>
          <Link
            to="/about"
            className="inline-flex h-12 items-center justify-center rounded-full border border-hairline px-7 text-base font-medium text-ink transition-colors hover:border-brand-400 hover:bg-raised"
          >
            Find the shop
          </Link>
        </div>
      </div>
    </section>
  );
}
