// ============================================================================
// BARCHI FURNITURE STOREFRONT - SERVICE WORKER & PWA ENGINE
// ============================================================================

const CACHE_NAME = 'barchi-user-pwa-v2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './allproduct.html',
  './allcategorie.html',
  './category.html',
  './product-detail.html',
  './account.html',
  './login.html',
  './shipping.html',
  './payment.html',
  './order-success.html',
  './about.html',
  './contact.html',
  './policies.html',
  './privacy-policy.html',
  './refund-policy.html',
  './shipping-policy.html',
  './styles.css',
  './main.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './images/barchi-logo.png'
];

// INSTALL: Cache primary static shell
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Non-critical cache item notice:', err);
      });
    })
  );
});

// ACTIVATE: Clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH: Network-first with Cache fallback for seamless experience
self.addEventListener('fetch', (e) => {
  // Ignore non-GET and API / Supabase requests from cache intercept
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (url.includes('/api/') || url.includes('supabase.co') || url.includes('phonepe.com')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
