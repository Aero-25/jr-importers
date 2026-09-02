import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Writes sitemap.xml and robots.txt into the build output.
 *
 * Products come from Supabase at build time rather than being listed by hand,
 * so a handset added in the console appears in the sitemap on the next deploy
 * instead of whenever somebody remembers to edit a file.
 *
 * If the fetch fails the static routes are still written. A sitemap missing the
 * products is worth having; no sitemap at all is what the site had before, and
 * a failed build over a search-engine hint would be a poor trade.
 */

const SITE = process.env.SITE_URL || 'https://jrimporters.com';

const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/shop/phones', priority: '0.9', changefreq: 'daily' },
  { path: '/shop/accessories', priority: '0.7', changefreq: 'weekly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/support', priority: '0.5', changefreq: 'monthly' },
  { path: '/terms.html', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy.html', priority: '0.3', changefreq: 'yearly' },
];

/** Routes that must never be indexed, whatever a crawler decides to try. */
const DISALLOW = ['/admin', '/admin/', '/admin-legacy.html', '/jobcard/', '/checkout', '/cart', '/account'];

function readConfig(root) {
  try {
    const raw = readFileSyncSafe(join(root, 'config.js'));
    if (!raw) return null;

    // config.js carries the previous project's values in a comment block so
    // they can be restored. Matching the file as-is picked those up instead of
    // the live ones, and the old project no longer resolves at all.
    const source = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    const url = source.match(/SUPABASE_URL:\s*'([^']+)'/)?.[1];
    const key = source.match(/SUPABASE_ANON_KEY:\s*'([^']+)'/)?.[1];
    return url && key ? { url, key } : null;
  } catch {
    return null;
  }
}

function readFileSyncSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

async function fetchProducts(config) {
  if (!config) return [];

  const params = new URLSearchParams({
    select: 'id,name,updated_at,category',
    active: 'eq.true',
    // Counter-only stock must not be advertised to search engines. RLS already
    // withholds it from the anon key this runs under; asking is explicit.
    show_online: 'eq.true',
    order: 'name.asc',
    limit: '500',
  });

  const response = await fetch(`${config.url}/rest/v1/products?${params}`, {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
  });
  if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
  return response.json();
}

/** Mirrors slugify() in src/lib/format.ts. The sitemap has to emit the same
 *  URL the site links to, or every product ends up indexed twice. */
function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function writeSitemap(outDir, root) {
  let products = [];
  try {
    products = await fetchProducts(readConfig(root));
  } catch (error) {
    console.warn(`[sitemap] could not read products (${error.message}); writing static routes only`);
  }

  const entries = [
    ...STATIC_ROUTES.map((route) =>
      urlEntry({
        loc: `${SITE}${route.path}`,
        changefreq: route.changefreq,
        priority: route.priority,
      }),
    ),
    ...products.map((product) =>
      urlEntry({
        loc: `${SITE}/product/${product.id}-${slugify(product.name)}`,
        lastmod: product.updated_at ? String(product.updated_at).slice(0, 10) : undefined,
        changefreq: 'weekly',
        priority: '0.8',
      }),
    ),
  ];

  writeFileSync(
    join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`,
    'utf8',
  );

  // Cloudflare serves a managed robots.txt when the site has none. It is a
  // reasonable default but it cannot know where the sitemap is, and it does not
  // keep crawlers out of the console or off a customer's job card link.
  writeFileSync(
    join(outDir, 'robots.txt'),
    [
      'User-agent: *',
      'Allow: /',
      ...DISALLOW.map((path) => `Disallow: ${path}`),
      '',
      `Sitemap: ${SITE}/sitemap.xml`,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`[sitemap] ${entries.length} urls (${products.length} products)`);
}
