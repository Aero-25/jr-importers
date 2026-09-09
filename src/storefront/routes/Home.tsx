import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUpRight, MapPin, ShieldCheck, Truck, Wallet, Wrench } from 'lucide-react';
import { useCatalog, useFacets } from '@/data/products';
import { STORE } from '@/lib/constants';
import { money } from '@/lib/format';
import { ErrorState } from '@/ui';
import { useParallax, useReveal, useSpecular } from '@/ui/effects';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { ChipRail } from '../components/ChipRail';
import { useSeo } from '../seo';

const PROMISES = [
  { icon: Truck, title: 'Nationwide delivery', detail: 'From our coast to your corner of Namibia' },
  { icon: MapPin, title: 'Collect in Walvis Bay', detail: 'Your local shop at Pelican Mall' },
  { icon: Wrench, title: 'Here for the long run', detail: 'Real people. Local repair support.' },
];

export default function Home() {
  useSeo({
    title: 'JR Importers — Cellphones in Namibia',
    description: 'Find your next phone, tablet and everyday tech at JR Importers, Walvis Bay. Genuine stock, nationwide delivery and local repair support.',
    path: '/',
  });
  const phones = useCatalog({ categories: ['Smartphones'], sort: 'price-asc' });
  const brands = useFacets({ categories: ['Smartphones'] });
  const revealRoot = useReveal<HTMLDivElement>([phones.data, brands.data]);
  const heroRef = useParallax<HTMLDivElement>(0.12);
  const { ref: laybuyRef, specularProps } = useSpecular<HTMLDivElement>();
  const cheapest = phones.data?.[0]?.price;

  return (
    <div ref={revealRoot} className="coast-home">
      <section className="coast-hero" aria-labelledby="coast-hero-title">
        <div ref={heroRef} data-hero className="coast-hero-scene" aria-hidden="true">
          <img src="/coastline-hero.webp" alt="" width="1672" height="941" fetchPriority="high" className="coast-hero-art" />
        </div>
        <div className="coast-hero-wash" aria-hidden="true" />
        <div className="coast-container coast-hero-content">
          <p className="coast-eyebrow reveal"><span className="coast-live-dot" /> Tech for life in Namibia</p>
          <h1 id="coast-hero-title" className="reveal" data-reveal-index="1">Your next<br />starts <span>here.</span></h1>
          <p className="coast-hero-copy reveal" data-reveal-index="2">Phones, tablets and everyday tech.<br className="hidden sm:block" /> From our shelf in Walvis Bay to your door.</p>
          <div className="coast-hero-actions reveal" data-reveal-index="3">
            <Link to="/shop/phones" className="coast-button">Shop phones <ArrowUpRight aria-hidden size={18} /></Link>
            <Link to="/shop" className="coast-text-link">Explore the shop <ArrowRight aria-hidden size={17} /></Link>
          </div>
          {phones.data && phones.data.length > 0 && (
            <div className="coast-hero-stock reveal" data-reveal-index="4">
              <span className="coast-stock-mark" aria-hidden><ShieldCheck size={18} /></span>
              <p><strong>On our shelf. Ready for you.</strong><span>{phones.data.length} handsets in stock{cheapest != null && <> · From {money(cheapest)}</>}</span></p>
            </div>
          )}
        </div>
        <div className="coast-hero-caption" aria-hidden="true"><span>DESIGNED FOR YOUR EVERYDAY</span><i /><span>ROOTED IN NAMIBIA</span></div>
        <a href="#find-your-next" className="coast-scroll-cue" aria-label="Discover phones in stock"><ArrowDown size={17} aria-hidden /></a>
      </section>

      <div className="coast-promise-strip">
        <ul className="coast-container">
          {PROMISES.map(({ icon: Icon, title, detail }) => (
            <li key={title}><Icon size={23} strokeWidth={1.45} aria-hidden /><div><strong>{title}</strong><span>{detail}</span></div></li>
          ))}
        </ul>
      </div>

      <section id="find-your-next" className="coast-container coast-stock-section">
        <div className="coast-section-heading reveal">
          <div><p className="coast-eyebrow">Good tech. Great possibilities.</p><h2>Find your next.</h2><p>Fresh from the shelf. Ready for wherever life takes you.</p></div>
          <Link to="/shop/phones" className="coast-text-link">All phones <ArrowUpRight aria-hidden size={18} /></Link>
        </div>
        <div className="reveal coast-home-chiprail"><ChipRail /></div>
        {phones.isError ? <ErrorState error={phones.error} onRetry={() => void phones.refetch()} /> : (
          <div className="coast-home-products grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {phones.isLoading ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />) : phones.data?.slice(0, 8).map((product, index) => (
              <div key={product.id} className="reveal" data-reveal-index={index}><ProductCard product={product} /></div>
            ))}
          </div>
        )}
        {!phones.isLoading && !phones.isError && phones.data?.length === 0 && <div className="coast-empty-shelf"><p>Something new is on the way.</p><Link to="/shop" className="coast-text-link">Explore the rest of the shop <ArrowRight aria-hidden size={17} /></Link></div>}
      </section>

      <section className="coast-container coast-editorials" aria-label="More possibilities with JR">
        <div ref={laybuyRef} {...specularProps} className="coast-laybuy reveal sheen">
          <div className="coast-laybuy-orbits" aria-hidden="true"><i /><i /><i /><span><Wallet size={32} strokeWidth={1.25} /></span></div>
          <div className="coast-editorial-content">
            <p className="coast-eyebrow">Make room for your next</p>
            <h2>Big plans.<br />Smaller payments.</h2>
            <p>Your next upgrade, at your pace. Start laybuy on an eligible phone with a 10% deposit.</p>
            <Link to="/shop/phones" className="coast-button coast-button-light">Find your laybuy phone <ArrowUpRight size={18} aria-hidden /></Link>
            <span className="coast-smallprint">Pay the balance within 3 months. Collect when fully paid.</span>
          </div>
        </div>
        <Link to="/shop/tablets" className="coast-tablet-story reveal" data-reveal-index="2">
          <img src="/coastline-hero.webp" alt="Tablet and phones overlooking Namibia’s Atlantic coastline" loading="lazy" width="1672" height="941" />
          <div className="coast-tablet-story-content"><p className="coast-eyebrow">A little more screen. A lot more possibility.</p><h2>Work. Play.<br />Take it anywhere.</h2><span className="coast-text-link">Explore tablets <ArrowUpRight size={18} aria-hidden /></span></div>
          <span className="coast-story-arrow" aria-hidden><ArrowUpRight size={23} /></span>
        </Link>
      </section>

      {brands.data && brands.data.brands.length > 0 && (
        <section className="coast-container coast-brand-section reveal" aria-label="Shop by brand">
          <div><p className="coast-eyebrow">The names you know.</p><h2>The next one you’ll love.</h2></div>
          <ul>{brands.data.brands.map(brand => <li key={brand.value}><Link to={`/shop/phones?brand=${encodeURIComponent(brand.value)}`}><span>{brand.value}</span><span className="coast-brand-count">{brand.count} in stock</span><ArrowUpRight size={18} aria-hidden /></Link></li>)}</ul>
        </section>
      )}
      <div className="coast-home-signoff reveal"><MapPin size={15} aria-hidden /><span>From {STORE.city}, with possibility.</span><span aria-hidden className="coast-signoff-line" /></div>
    </div>
  );
}
