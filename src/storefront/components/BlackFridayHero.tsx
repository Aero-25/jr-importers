import { useEffect, useState, type CSSProperties } from 'react';
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
  const before = now < windowEdge(startsOn, false);
  const left = Math.max(0, (before ? windowEdge(startsOn, false) : windowEdge(endsOn, true)) - now);
  const s = Math.floor(left / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  return {
    before,
    label: before ? 'Starts in' : 'Ends in',
    days,
    hours,
    parts: [
      { unit: 'Days', value: days },
      { unit: 'Hrs', value: hours },
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

/** Fixed, not random: the same sparks on every render and every visit. */
const SPARKS = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 37) % 100,
  delay: -((i * 1.7) % 9),
  duration: 7 + ((i * 3) % 6),
  size: 2 + (i % 3),
}));

/**
 * The home page hero for Black Friday: JR's lime on black, the JR Android
 * flickering like a neon sign, a live countdown and the best deal on a tag.
 *
 * Shown from two weeks before the sale as a countdown (`upcoming`), then for
 * the four days themselves. Before the window it never shows a sale price.
 */
export function BlackFridayHero({
  promotion,
  deals,
  upcoming = false,
}: {
  promotion: ActivePromotion;
  deals: PublicProductRow[];
  upcoming?: boolean;
}) {
  const countdown = useCountdown(promotion.startsOn, promotion.endsOn);
  const { days, month } = dayRange(promotion.startsOn, promotion.endsOn);
  const startDay = new Date(`${promotion.startsOn}T12:00:00`).getDate();

  const offOf = (p: PublicProductRow) => {
    const sale = salePriceOf(p, promotion);
    return sale === null ? 0 : Math.round(((Number(p.price) - sale) / Number(p.price)) * 100);
  };
  const ranked = upcoming ? [] : [...deals.filter((p) => p.image)].sort((a, b) => offOf(b) - offOf(a));
  const star = ranked[0] ?? null;
  const maxOff = upcoming ? 0 : deals.reduce((m, p) => Math.max(m, offOf(p)), 0);
  const starSale = star ? salePriceOf(star, promotion) : null;
  const starNote = star ? dealNoteOf(star, promotion) : null;

  return (
    <section className={upcoming ? 'bf-hero bf-hero--soon' : 'bf-hero'} aria-labelledby="coast-hero-title">
      <div className="bf-hero__backdrop" aria-hidden="true">
        <div className="bf-hero__glow" />
        <div className="bf-hero__floor" />
        <div className="bf-hero__sparks">
          {SPARKS.map((spark, i) => (
            <i
              key={i}
              style={
                {
                  '--x': `${spark.x}%`,
                  '--delay': `${spark.delay}s`,
                  '--duration': `${spark.duration}s`,
                  '--size': `${spark.size}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <span className="bf-hero__ghost">BF</span>
      </div>

      <div className="coast-container bf-hero__inner">
        <div className="bf-hero__copy">
          <p className="bf-hero__presents">
            <span className="bf-hero__live" />
            <span>
              <strong>JR</strong> Importers presents
            </span>
            {promotion.preview && <em>Preview</em>}
            {upcoming && <em>Coming soon</em>}
          </p>

          <h1 id="coast-hero-title" className="bf-hero__title">
            <span className="bf-hero__black">Black</span>
            <span className="bf-hero__friday">
              Fri<span className="bf-hero__flicker">d</span>ay
            </span>
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
            {upcoming
              ? `Our biggest four days of the year start ${startDay} ${month}. Black Friday prices on selected phones and accessories, plus packages put together for you.`
              : 'Our biggest four days of the year. Black Friday prices on selected phones and accessories, plus packages put together for you. When it’s gone, it’s gone.'}
          </p>

          <div
            className="bf-hero__countdown"
            role="timer"
            aria-label={`${countdown.label} ${countdown.days} days ${countdown.hours} hours`}
          >
            <span className="bf-hero__countdown-label">{countdown.label}</span>
            <ol aria-hidden="true">
              {countdown.parts.map((part) => (
                <li key={part.unit}>
                  <b className="tabular" key={part.value}>
                    {String(part.value).padStart(2, '0')}
                  </b>
                  <small>{part.unit}</small>
                </li>
              ))}
            </ol>
          </div>

          <div className="bf-hero__actions">
            {upcoming ? (
              <Link to="/shop/phones" className="bf-hero__cta">
                Shop phones now <ArrowUpRight aria-hidden size={18} />
              </Link>
            ) : (
              <Link to="/shop?deals=1" className="bf-hero__cta">
                Shop Black Friday <ArrowUpRight aria-hidden size={18} />
              </Link>
            )}
            <Link to={upcoming ? '/shop' : '/shop/phones'} className="bf-hero__link">
              {upcoming ? 'Explore the shop' : 'All phones'} <ArrowRight aria-hidden size={16} />
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
          <div className="bf-hero__disc" aria-hidden="true">
            <span className="bf-hero__scan" />
          </div>

          {/* The JR Android, flickering like a neon sign with the odd glitch. */}
          <div className="bf-hero__android" aria-hidden="true">
            <img src="/bf-android.webp" alt="" width={420} height={757} className="bf-hero__android-ghost bf-hero__android-ghost--a" />
            <img src="/bf-android.webp" alt="" width={420} height={757} className="bf-hero__android-ghost bf-hero__android-ghost--b" />
            <img src="/bf-android.webp" alt="" width={420} height={757} fetchPriority="high" className="bf-hero__android-main" />
            <span className="bf-hero__android-floor" />
          </div>

          {star && (
            <Link to={productPath(star)} className="bf-hero__deal" aria-label={`${star.name}, Black Friday deal`}>
              <img src={star.image!} alt="" />
              <span>
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
                    <Gift aria-hidden size={11} /> {starNote}
                  </em>
                )}
              </span>
            </Link>
          )}

          <span className="bf-hero__burst" aria-hidden="true">
            {upcoming ? (
              <>
                <small>From</small>
                <b>{startDay}</b>
                <small>{month.slice(0, 3)}</small>
              </>
            ) : maxOff > 0 ? (
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
              {[...TICKER, ...TICKER].map((word, i) => (
                <span key={`${word}-${i}`}>
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
