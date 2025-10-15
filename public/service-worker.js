const SW_VERSION = 'v3.3'; 

const DB_NAME = 'pwa-db-v3';
const DB_VERSION = 1;
const OUTBOX = 'outbox';

const PROD_URL = 'https://proyecto-brayan.onrender.com'; 
const BACKEND_URL = self.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : PROD_URL;

const STATIC_CACHE = `static-${SW_VERSION}`;
const IMMUTABLE_CACHE = `immutable-${SW_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${SW_VERSION}`;

const STATIC_URLS = [
  '/', '/index.html', '/offline.html', '/manifest.json', '/vite.svg',
  '/icons/icon-192.png', '/icons/icon-512.png',
];

const isSameOrigin = (url) => url.origin === self.location.origin;
const isStaticShell = (pathname) => STATIC_URLS.includes(pathname);
const isImmutableAsset = (pathname) => pathname.startsWith('/assets/');
const isImageLike = (pathname) => /\.(png|jpg|jpeg|gif|webp|svg|ico|avif)$/i.test(pathname);
const isCSSorFont = (pathname) => /\.(css|woff2?|ttf|otf|eot)$/i.test(pathname);
const isAPI = (pathname) => pathname.startsWith('/api/');

self.addEventListener('install', (e) => {
  console.log('[SW]', SW_VERSION, 'install');
  e.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[SW]', SW_VERSION, 'activate');
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (![STATIC_CACHE, IMMUTABLE_CACHE, DYNAMIC_CACHE].includes(k)) {
          return caches.delete(k);
        }
      })
    );
    await self.clients.claim();
  })());
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const resp = await fetch(request);
  if (resp && resp.ok) cache.put(request, resp.clone());
  return resp;
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fetchPromise = fetch(request)
    .then((resp) => {
      if (resp && resp.ok) cache.put(request, resp.clone());
      return resp;
    })
    .catch(() => null);
  return cached || fetchPromise;
}

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(request);
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }
    throw new Error('Network and cache both failed');
  }
}

async function handleNavigation(event) {
  try {
    const net = await fetch(event.request, { redirect: 'follow' });
    return net;
  } catch {
    const staticCache = await caches.open(STATIC_CACHE);
    const url = new URL(event.request.url);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const shell = await staticCache.match('/index.html');
      if (shell) return shell;
    }
    const offline = await staticCache.match('/offline.html');
    if (offline) return offline;

    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (!isSameOrigin(url)) return;

  const { pathname } = url;

  if (isStaticShell(pathname)) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  if (isImmutableAsset(pathname)) {
    event.respondWith(staleWhileRevalidate(IMMUTABLE_CACHE, request));
    return;
  }

  if (isImageLike(pathname) || isCSSorFont(pathname)) {
    event.respondWith(staleWhileRevalidate(DYNAMIC_CACHE, request));
    return;
  }

  if (isAPI(pathname)) {
    event.respondWith(networkFirst(DYNAMIC_CACHE, request));
    return;
  }

  event.respondWith(staleWhileRevalidate(DYNAMIC_CACHE, request));
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-entries') event.waitUntil(syncEntries());
});
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SYNC_NOW') e.waitUntil(syncEntries());
});

// --------------- IndexedDB (outbox) ---------------
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      try { if (db.objectStoreNames.contains(OUTBOX)) db.deleteObjectStore(OUTBOX); } catch {}
      db.createObjectStore(OUTBOX, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => db.close(); res(db); };
    req.onerror = () => rej(req.error);
  });
}
const idbAll = (store) => new Promise((res, rej) => {
  const r = store.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
});
const idbClear = (store) => new Promise((res, rej) => {
  const r = store.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error);
});

async function syncEntries() {
  console.log('[SW] sync-entries disparado');

  const db = await openDB();

  // 1) Leer pendientes
  let items = [];
  {
    const tx = db.transaction(OUTBOX, 'readonly');
    const store = tx.objectStore(OUTBOX);
    items = await idbAll(store);
    await new Promise((r) => { tx.oncomplete = r; tx.onabort = r; });
  }

  if (!items.length) {
    console.log('[SW] Nada que enviar');
    db.close?.();
    return;
  }

  const processedIds = items.map(x => x.id).filter((x) => x != null);

  // 2) Enviar
  let ok = false;
  try {
    const resp = await fetch(`${BACKEND_URL}/api/entries/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    ok = resp.ok;
    if (!ok) console.warn('[SW] status', resp.status);
  } catch (e) {
    console.warn('[SW] fetch error', e);
  }

  if (ok) {
    const tx2 = db.transaction(OUTBOX, 'readwrite');
    await idbClear(tx2.objectStore(OUTBOX));
    await new Promise((r) => { tx2.oncomplete = r; tx2.onabort = r; });
    console.log('[SW] Enviados y limpiados:', items.length);

    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) {
        c.postMessage({ type: 'OUTBOX_SENT', processedIds });
      }
    } catch {}
  } else {
    console.warn('[SW] Falló el envío, se quedan en outbox');
  }

  db.close?.();
}

// --- PUSH NOTIFICATIONS ---

// Muestra la notificación cuando llega un push
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const title = data.title || 'Notificación';
  const options = {
    body: data.body || 'Tienes un nuevo mensaje.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    image: data.image,                   
    tag: data.tag || 'demo-push',         
    data: {
      url: data.url || '/',               
      ...data,
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Descartar' },
    ],
    // requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Gestiona los clics en la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  if (event.action === 'dismiss') return;

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    const exact = allClients.find((c) => {
      try { return new URL(c.url).pathname === new URL(urlToOpen, self.location.origin).pathname; }
      catch { return false; }
    });
    if (exact && 'focus' in exact) {
      await exact.focus();
      return;
    }

    const anyClient = allClients.find((c) => c.url.startsWith(self.location.origin));
    if (anyClient && 'navigate' in anyClient) {
      await anyClient.navigate(urlToOpen);
      await anyClient.focus?.();
      return;
    }

    // 3) Abrir nueva pestaña
    await self.clients.openWindow(urlToOpen);
  })());
});
