// ═══════════════════════════════════════════════════════════════════════════
//  UYEH TECH — SERVICE WORKER  v2.1
//  Place at: / (root of uyeh.netlify.app)
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const APP_VERSION   = 'uyeh-v2.1';
const STATIC_CACHE  = `${APP_VERSION}-static`;
const API_CACHE     = `${APP_VERSION}-api`;
const IMAGE_CACHE   = `${APP_VERSION}-images`;
const API_CACHE_TTL = 5 * 60 * 1000;
const API_CACHE_MAX = 60;
const IMAGE_CACHE_MAX = 80;

const BACKEND_HOST  = 'uyehtechbackend.onrender.com';
const FRONTEND_HOST = 'uyehtech.netlify.app';

const NEVER_CACHE_PATTERNS = [
  '/api/auth/',
  '/api/orders/verify-payment',
  '/api/orders/create',
  '/api/admin/',
  '/api/affiliate/register',
];

// Pages to pre-cache — only files that ACTUALLY EXIST on your Netlify deploy
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/sw.js',
  '/pwa-install.js',
  '/site.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log(`[SW ${APP_VERSION}] Installing…`);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async cache => {
      const results = await Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Pre-cache skip (${url}):`, err.message)
          )
        )
      );
      const cached  = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[SW] Pre-cached ${cached}/${PRECACHE_URLS.length} assets`);
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log(`[SW ${APP_VERSION}] Activating…`);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('uyeh-') && ![STATIC_CACHE, API_CACHE, IMAGE_CACHE].includes(k))
          .map(k => { console.log('[SW] Purging old cache:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  if (NEVER_CACHE_PATTERNS.some(p => url.pathname.startsWith(p))) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.hostname === BACKEND_HOST || url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (url.hostname.includes('res.cloudinary.com')) {
    event.respondWith(cacheFirstImages(request));
    return;
  }

  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('kit.fontawesome.com')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.hostname === FRONTEND_HOST || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

// ── STRATEGIES ────────────────────────────────────────────────────────────────
async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const networkRes = await fetch(request.clone(), { signal: AbortSignal.timeout(8000) });
    if (networkRes.ok && !isOpaque(networkRes)) {
      const stamped = await stampResponse(networkRes.clone());
      cache.put(request, stamped);
      await trimCache(API_CACHE, API_CACHE_MAX);
    }
    return networkRes;
  } catch {
    const cached = await cache.match(request);
    if (cached && (await getCacheAge(cached)) < API_CACHE_TTL) {
      return addHeader(cached, 'X-SW-Source', 'cache');
    }
    return offlineJson();
  }
}

async function cacheFirstImages(request) {
  const cache  = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok && !isOpaque(res)) {
      cache.put(request, res.clone());
      await trimCache(IMAGE_CACHE, IMAGE_CACHE_MAX);
    }
    return res;
  } catch {
    return new Response('Image unavailable offline', { status: 503 });
  }
}

async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (!isOpaque(res)) cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('Resource unavailable offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(res => { if (res.ok && !isOpaque(res)) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  if (cached) { networkPromise.catch(() => {}); return cached; }
  const res = await networkPromise;
  if (res) return res;
  return cache.match('/offline.html') || new Response('<h1>You are offline</h1>', { headers: { 'Content-Type': 'text/html' } });
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); }
  catch { data = { title: 'UYEH TECH', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'UYEH TECH', {
      body:    data.body    || 'You have a new notification',
      icon:    data.icon    || '/icons/icon-192.png',
      badge:   data.badge   || '/icons/icon-96.png',
      tag:     data.tag     || 'uyeh-notification',
      data:    { url: data.url || '/' },
      actions: data.actions || [],
      vibrate: [200, 100, 200],
      requireInteraction: data.requireInteraction || false,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url === targetUrl && 'focus' in c) return c.focus(); }
      return clients.openWindow(targetUrl);
    })
  );
});

// ── BACKGROUND SYNC ───────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'uyeh-offline-queue') event.waitUntil(replayOfflineQueue());
});

async function replayOfflineQueue() {
  try {
    const db      = await openQueueDB();
    const entries = await getAllQueueEntries(db);
    for (const entry of entries) {
      try {
        const res = await fetch(entry.url, { method: entry.method, headers: entry.headers, body: entry.body });
        if (res.ok) { await deleteQueueEntry(db, entry.id); console.log('[SW] Replayed:', entry.url); }
      } catch { console.warn('[SW] Replay failed, will retry:', entry.url); }
    }
  } catch (err) { console.warn('[SW] Background sync error:', err); }
}

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('uyeh-sw-queue', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}
function getAllQueueEntries(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readonly');
    const req = tx.objectStore('queue').getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}
function deleteQueueEntry(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readwrite');
    const req = tx.objectStore('queue').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── MESSAGE BUS ───────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING') { console.log('[SW] SKIP_WAITING — activating now'); self.skipWaiting(); }
  if (type === 'GET_VERSION')  { event.source?.postMessage({ type: 'SW_VERSION', version: APP_VERSION }); }
  if (type === 'CLEAR_API_CACHE') { caches.delete(API_CACHE).then(() => event.source?.postMessage({ type: 'CACHE_CLEARED' })); }
});

// ── UTILITIES ─────────────────────────────────────────────────────────────────
function isOpaque(res) { return res.type === 'opaque'; }
async function stampResponse(response) {
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set('X-SW-Cached-At', Date.now().toString());
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
async function getCacheAge(cached) {
  const t = cached.headers.get('X-SW-Cached-At');
  return t ? Date.now() - parseInt(t, 10) : Infinity;
}
async function addHeader(response, key, value) {
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set(key, value);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length > maxEntries) await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
}
function offlineJson() {
  return new Response(
    JSON.stringify({ success: false, offline: true, message: 'You are offline. Please check your connection.' }),
    { status: 503, headers: { 'Content-Type': 'application/json', 'X-SW-Source': 'offline' } }
  );
}