// ============================================
// JR IMPORTERS - SERVICE WORKER v4.0
// ============================================
// Network-first for HTML, stale-while-revalidate
// for same-origin assets, and no interception for
// external or API requests.
// ============================================

const CACHE_NAME = 'jr-importers-v4.1';
const FAVICON_URL = '/icon.svg';
const DEBUG = false;
const debugLog = (...args) => {
    if (DEBUG) {
        globalThis.console.log(...args);
    }
};

// Core same-origin assets
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/admin.html',
    '/privacy.html',
    '/terms.html',
    '/offline.html',
    '/config.js',
    '/app-shell.js',
    '/manifest.webmanifest',
    '/admin.webmanifest',
    '/icon.svg'
];

// NEVER intercept these URLs - let them go directly to network
const BYPASS_URLS = [
    '/api/',
    'supabase.co',
    'supabase.in',
    'unpkg.com',
    'cdnjs.cloudflare.com',
    'cdn.tailwindcss.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'fontawesome',
    'onesignal.com',
    'OneSignalSDKWorker.js',
    'api.',
    '/rest/v1/',
    '/auth/v1/',
    '/storage/v1/',
    '/realtime/',
    'dpogroup.com',
    'paygate',
    'i.ibb.co',
    'cloudflare',
    'googleapis',
    'gstatic'
];

// Check if URL should bypass service worker
function shouldBypass(url) {
    return BYPASS_URLS.some(pattern => url.includes(pattern));
}

function isHtmlRequest(request) {
    return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
}

async function cacheResponse(request, response) {
    if (!response || response.status !== 200 || request.method !== 'GET') {
        return response;
    }

    const url = new URL(request.url);
    if (url.origin !== self.location.origin || shouldBypass(url.href)) {
        return response;
    }

    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    return response;
}

// Install - cache static assets only
self.addEventListener('install', (event) => {
    debugLog('[SW] Installing v4.0...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                debugLog('[SW] Caching core assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .catch((err) => {
                debugLog('[SW] Cache failed, continuing anyway:', err);
            })
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    debugLog('[SW] Activating v4.0...');
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        debugLog('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                    return Promise.resolve();
                })
            );

            await self.clients.claim();
        })()
    );
});

// Fetch - CRITICAL: Only handle same-origin static assets
self.addEventListener('fetch', (event) => {
    const requestUrl = event.request.url;
    
    // CRITICAL: Never intercept external/API requests
    if (shouldBypass(requestUrl)) {
        // Do nothing - let browser handle normally
        return;
    }
    
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Check if same origin
    const url = new URL(requestUrl);
    if (url.origin !== self.location.origin) {
        // External request - don't intercept
        return;
    }

    if (isHtmlRequest(event.request)) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => cacheResponse(event.request, networkResponse))
                .catch(async () => {
                    const cachedResponse = await caches.match(event.request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    const offlinePage = await caches.match('/offline.html');
                    if (offlinePage) {
                        return offlinePage;
                    }

                    return new Response('Offline', {
                        status: 503,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const networkFetch = fetch(event.request)
                .then((networkResponse) => cacheResponse(event.request, networkResponse))
                .catch(() => null);

            if (cachedResponse) {
                event.waitUntil(networkFetch);
                return cachedResponse;
            }

            return networkFetch.then((networkResponse) => (
                networkResponse || new Response('Offline', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                })
            ));
        })
    );
});

// Push notification
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'New update available!',
        icon: FAVICON_URL,
        badge: FAVICON_URL,
        vibrate: [200, 100, 200]
    };
    event.waitUntil(
        self.registration.showNotification('JR Importers', options)
    );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});

debugLog('[SW] Service Worker v4.0 loaded - API requests will NOT be intercepted');
