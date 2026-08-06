import { useEffect } from 'react';
import { config } from '@/lib/env';
import { STORE } from '@/lib/constants';

export interface SeoInput {
  title: string;
  description?: string;
  /** Path only, e.g. `/product/12-galaxy-a16`. Combined with the site origin. */
  path?: string;
  image?: string | null;
  /** JSON-LD injected for this route and removed on unmount. */
  jsonLd?: Record<string, unknown> | null;
  noIndex?: boolean;
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Per-route document head.
 *
 * The legacy storefront rendered every view at `/` from component state, so a
 * crawler saw exactly one title, one description and one URL for the whole
 * catalogue. Real routes plus this hook mean each product is separately
 * indexable and shareable.
 */
export function useSeo({ title, description, path, image, jsonLd, noIndex }: SeoInput): void {
  useEffect(() => {
    const fullTitle = title.includes(STORE.name) ? title : `${title} — ${STORE.name}`;
    document.title = fullTitle;

    if (description) {
      setMeta('meta[name="description"]', 'name', 'description', description);
      setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    }
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);

    const url = `${config.SITE_URL}${path ?? window.location.pathname}`;
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setLink('canonical', url);

    if (image) setMeta('meta[property="og:image"]', 'property', 'og:image', image);

    setMeta(
      'meta[name="robots"]',
      'name',
      'robots',
      noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
    );

    if (!jsonLd) return;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.route = 'true';
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [title, description, path, image, jsonLd, noIndex]);
}

/** schema.org Product, so search results can show price and availability. */
export function productJsonLd(product: {
  id: number;
  name: string;
  description: string | null;
  brand: string | null;
  price: number;
  stock: number;
  image: string | null;
  sku: string | null;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? undefined,
    sku: product.sku ?? String(product.id),
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    image: product.image ?? undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'NAD',
      price: product.price,
      availability:
        product.stock > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: STORE.name },
    },
  };
}

/** Breadcrumb trail, so results show `Shop › Phones › Galaxy A16`. */
export function breadcrumbJsonLd(
  trail: Array<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: `${config.SITE_URL}${entry.path}`,
    })),
  };
}
