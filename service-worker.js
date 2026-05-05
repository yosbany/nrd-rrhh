// Service Worker for PWA offline support (Generic for all NRD projects)
// This file should be copied to each project's root directory

// Get project name from service worker path or use default
const getProjectName = () => {
  const path = self.location.pathname;
  // Extract project name from path (e.g., /nrd-rrhh/service-worker.js -> nrd-rrhh)
  const match = path.match(/\/(nrd-[^/]+)\//);
  return match ? match[1] : 'nrd-app';
};

const PROJECT_NAME = getProjectName();
const CACHE_NAME = `${PROJECT_NAME}-v1-` + Date.now();

// Get base path from service worker location
const getBasePath = () => {
  const path = self.location.pathname;
  return path.substring(0, path.lastIndexOf('/') + 1);
};
const BASE_PATH = getBasePath();

// Install event - skip waiting to activate immediately and clear old caches
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete all old caches
          if (cacheName.startsWith(`${PROJECT_NAME}-`)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete all old caches for this project
          if (cacheName.startsWith(`${PROJECT_NAME}-`)) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Force all clients to reload
      return self.clients.claim();
    })
  );
  return self.clients.claim();
});

// Fetch event - Network first strategy for better updates
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip non-HTTP/HTTPS schemes (chrome-extension, data, blob, etc.)
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Skip service worker file itself - always fetch from network
  if (event.request.url.includes('service-worker.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Skip Firebase CDN - always fetch from network
  if (event.request.url.includes('firebasejs') || event.request.url.includes('gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Skip Tailwind CDN - always fetch from network
  if (event.request.url.includes('cdn.tailwindcss.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network first strategy for HTML, JS, and CSS files
  // Always fetch from network - never cache these files
  if (event.request.url.includes('.html') || 
      event.request.url.includes('.js') || 
      event.request.url.includes('.css')) {
    
    // Always fetch from network with no-cache headers
    event.respondWith(
      fetch(event.request, { 
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
        .then((response) => {
          // Don't cache HTML, JS, CSS files - always fetch fresh
          return response;
        })
        .catch(() => {
          // If network fails, try cache as fallback
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If both fail and it's a navigation request, return cached index.html
            if (event.request.mode === 'navigate') {
              return caches.match(BASE_PATH + 'index.html');
            }
          });
        })
    );
    return;
  }

  // For other resources (images, fonts, etc.), use network first, cache as fallback
  // But don't cache aggressively in development
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        // Only cache successful responses for non-HTML/JS/CSS files
        if (response && response.status === 200 && response.type === 'basic') {
          // Don't cache in development - always fetch fresh
          // Uncomment below for production caching of static assets
          // const responseToCache = response.clone();
          // caches.open(CACHE_NAME).then((cache) => {
          //   cache.put(event.request, responseToCache).catch((err) => {
          //     console.warn('Failed to cache:', event.request.url, err);
          //   });
          // }).catch((err) => {
          //   console.warn('Failed to open cache:', err);
          // });
        }
        return response;
      })
      .catch(() => {
        // If network fails, try cache as fallback
        return caches.match(event.request);
      })
  );
});
