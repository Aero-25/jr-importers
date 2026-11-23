import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Gift } from 'lucide-react';
import type { PublicProductRow } from '@/lib/database.types';
import type { ActivePromotion } from '@/data/promotions';
import { dealNoteOf, salePriceOf } from '@/data/promotions';
import { money } from '@/lib/format';
import { productPath } from './ProductCard';
import './black-friday-hero.css';

/** Walvis Bay is UTC+2 all year, so the window's edges are fixed instants. */
function windowEdge(day: string, end: boolean): number {
  return new Date(`${day}T${end ? '23:59:59' : '00:00:00'}+02:00`).getTime();
}

function useCountdown(startsOn: string, endsOn: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const start = windowEdge(startsOn, false);
  const end = windowEdge(endsOn, true);
  const before = now < start;
  const left = Math.max(0, (before ? start : end) - now);
  const s = Math.floor(left / 1000);
  return {
    label: before ? 'Starts in' : 'Ends in',
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    parts: [
      { unit: 'Days', value: Math.floor(s / 86400) },
      { unit: 'Hrs', value: Math.floor((s % 86400) / 3600) },
      { unit: 'Min', value: Math.floor((s % 3600) / 60) },
      { unit: 'Sec', value: s % 60 },
    ],
  };
}

function dayRange(from: string, to: string): { days: string; month: string } {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  const month = b.toLocaleDateString('en-GB', { month: 'long' });
  return { days: from === to ? `${b.getDate()}` : `${a.getDate()}–${b.getDate()}`, month };
}

const TICKER = ['Black Friday', 'JR Importers', 'Walvis Bay', 'Online & in store', 'Deals + packages', 'While stock lasts'];

/**
 * The home page hero for the Black Friday promotion: JR's lime on black,
 * the mascot, a live countdown, and the best deal on a spotlight.
 */
export function BlackFridayHero({
  promotion,
  deals,
}: {
  promotion: ActivePromotion;
  deals: PublicProductRow[];
}) {
  const countdown = useCountdown(promotion.startsOn, promotion.endsOn);
  const { days, month } = dayRange(promotion.startsOn, promotion.endsOn);

  // The spotlight goes to the deepest cut that has a photo; a package if
  // nothing is reduced yet.
  const withPhotos = deals.filter((p) => p.image);
  const offOf = (p: PublicProductRow) => {
    const sale = salePriceOf(p, promotion);
    return sale === null ? 0 : Math.round(((Number(p.price) - sale) / Number(p.price)) * 100);
  };
  const ranked = [...withPhotos].sort((a, b) => offOf(b) - offOf(a));
  const star = ranked[0] ?? null;
  const supporting = ranked.slice(1, 3);
  const maxOff = deals.reduce((m, p) => Math.max(m, offOf(p)), 0);
  const starSale = star ? salePriceOf(star, promotion) : null;
  const starNote = star ? dealNoteOf(star, promotion) : null;

  return (
    <section className="bf-hero" aria-labelledby="coast-hero-title">
      <div className="bf-hero__backdrop" aria-hidden="true">
        <div className="bf-hero__grid" />
        <div className="bf-hero__glow" />
        <span className="bf-hero__ghost">BF</span>
      </div>

      <div className="coast-container bf-hero__inner">
        <div className="bf-hero__copy">
          <p className="bf-hero__presents">
            <img src="/logo-mark.png" alt="" width={20} height={36} />
            <span>
              <strong>JR</strong> Importers presents
            </span>
            {promotion.preview && <em>Preview</em>}
          </p>

          <h1 id="coast-hero-title" className="bf-hero__title">
            <span className="bf-hero__black">Black</span>
            <span className="bf-hero__friday">Friday</span>
          </h1>

          <div className="bf-hero__when">
            <strong>{days}</strong>
            <span>
              {month}
              <br />
              Online &amp; at Pelican Mall
            </span>
          </div>

          <p className="bf-hero__lede">
            Four days of our best prices on selected phones and accessories, plus packages put together
            for you. When it’s gone, it’s gone.
          </p>

          <div className="bf-hero__countdown" role="timer" aria-label={`${countdown.label} ${countdown.days} days ${countdown.hours} hours`}>
            <span className="bf-hero__countdown-label">{countdown.label}</span>
            <ol aria-hidden="true">
              {countdown.parts.map((part) => (
                <li key={part.unit}>
                  <b className="tabular">{String(part.value).padStart(2, '0')}</b>
                  <small>{part.unit}</small>
                </li>
              ))}
            </ol>
          </div>

          <div className="bf-hero__actions">
            <Link to="/shop?deals=1" className="bf-hero__cta">
              Shop Black Friday <ArrowUpRight aria-hidden size={18} />
            </Link>
            <Link to="/shop/phones" className="bf-hero__link">
              All phones <ArrowRight aria-hidden size={16} />
            </Link>
          </div>
        </div>

        <div className="bf-hero__stage">
          <svg className="bf-hero__ring" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <path id="bf-ring-path" d="M100,100 m-84,0 a84,84 0 1,1 168,0 a84,84 0 1,1 -168,0" />
            </defs>
            <text>
              <textPath href="#bf-ring-path" textLength="524" lengthAdjust="spacing">
                BLACK FRIDAY ✦ JR IMPORTERS ✦ {days} {month.toUpperCase()} ✦ WALVIS BAY ✦
              </textPath>
            </text>
          </svg>
          <div className="bf-hero__disc" aria-hidden="true" />

          {star ? (
            <Link to={productPath(star)} className="bf-hero__star" aria-label={`${star.name}, Black Friday deal`}>
              {supporting.map((p, i) => (
                <img key={p.id} src={p.image!} alt="" className={`bf-hero__support bf-hero__support--${i}`} />
              ))}
              <img src={star.image!} alt={star.name} className="bf-hero__star-img" fetchPriority="high" />
              <span className="bf-hero__tag">
                <small>{star.name}</small>
                {starSale !== null ? (
                  <>
                    <s>{money(Number(star.price))}</s>
                    <b>{money(starSale)}</b>
                  </>
                ) : (
                  <b>{money(Number(star.price))}</b>
                )}
                {starNote && (
                  <em>
                    <Gift aria-hidden size={12} /> {starNote}
                  </em>
                )}
              </span>
            </Link>
          ) : (
            <img src="/logo-mark.png" alt="" width={133} height={240} className="bf-hero__mascot" aria-hidden="true" />
          )}

          <span className="bf-hero__burst" aria-hidden="true">
            {maxOff > 0 ? (
              <>
                <small>Up to</small>
                <b>{maxOff}%</b>
                <small>off</small>
              </>
            ) : (
              <>
                <small>Deals</small>
                <b>+</b>
                <small>Packages</small>
              </>
            )}
          </span>
        </div>
      </div>

      <div className="bf-hero__ticker" aria-hidden="true">
        <div>
          {[0, 1].map((copy) => (
            <p key={copy}>
              {TICKER.map((word) => (
                <span key={word}>
                  {word}
                  <i>✦</i>
                </span>
              ))}
              {TICKER.map((word) => (
                <span key={`${word}-2`}>
                  {word}
                  <i>✦</i>
                </span>
              ))}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
