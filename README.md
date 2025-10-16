# 🌐 PWA – BrayanApp (v3.3)

Aplicación Web Progresiva (**PWA**) desarrollada con **Vite + React + TypeScript**, que permite registrar actividades incluso sin conexión a Internet.  
Los datos se almacenan localmente en **IndexedDB** (outbox) y se sincronizan automáticamente con el servidor mediante **Background Sync** cuando la conexión regresa.  
Además, la app integra **notificaciones push** mediante **VAPID** (Web Push Protocol) y un backend en **Render (Node + Express)**.

---

## 🚀 Características principales

-  **App Shell** con carga instantánea (HTML, CSS y JS cacheados).  
-  **Modo offline completo** gracias a **IndexedDB**.  
-  **Background Sync API**: sincroniza los datos pendientes al reconectarse.  
-  **Notificaciones Push** (con suscripción VAPID).  
-  **Página personalizada sin conexión (`offline.html`)**.  
-  **Estrategias de caché avanzadas** (Cache First, Stale-While-Revalidate, Network First).  
-  **Instalable (A2HS)** en dispositivos móviles y escritorio.  
-  **Desplegada en HTTPS**:
  - **Frontend (Vercel):** [https://proyecto-brayan.vercel.app](https://proyecto-brayan.vercel.app)
  - **Backend (Render):** [https://proyecto-brayan.onrender.com](https://proyecto-brayan.onrender.com)

---

## Estructura del proyecto

```
proyecto-brayan/
│
├── public/
│   ├── service-worker.js         # SW: caché, background sync y push
│   ├── offline.html              # Página sin conexión personalizada
│   ├── manifest.json             # Configuración para instalación PWA
│   └── icons/                    # Íconos (192, 512, etc.)
│
├── src/
│   ├── register-sw.ts            # Registro del Service Worker y Push API
│   ├── lib/                      # IndexedDB y lógica local
│   ├── components/               # EntryForm, EntryList, OfflineBadge
│   ├── api/                      # Comunicación con el backend
│   ├── App.tsx / main.tsx        # App Shell React
│   └── styles/                   # Estilos globales
│
├── server/
│   ├── index.js                  # Backend Node.js + Web Push
│   ├── .env                      # Claves VAPID privadas/públicas
│   └── package.json
│
├── package.json                  # Configuración Frontend
└── README.md                     # Documentación completa
```

---

## ⚙️ Estrategias de Caché

| Tipo de recurso | Estrategia aplicada | Justificación |
|-----------------|--------------------|----------------|
| **App Shell** (`/`, `/index.html`, `/manifest.json`, `/offline.html`, `/vite.svg`) | **Cache First** | Permite carga inmediata del esqueleto base de la app incluso sin conexión. |
| **Assets con hash** (`/assets/*`) | **Stale-While-Revalidate** | Carga rápida y actualización silenciosa de versiones nuevas. |
| **Imágenes, CSS y fuentes** | **Stale-While-Revalidate** | Mantiene la app visualmente fluida mientras actualiza los recursos. |
| **API REST (`/api/*`)** | **Network First** | Prioriza datos actualizados; usa caché solo si no hay red. |
| **Página offline (`offline.html`)** | **Cache Only** | Garantiza que siempre haya respuesta cuando no hay conexión. |

---

###  Implementación real (`service-worker.js`)

```js
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (STATIC_URLS.includes(url.pathname)) {
    return event.respondWith(cacheFirst(STATIC_CACHE, request));
  }
  if (url.pathname.startsWith('/assets/')) {
    return event.respondWith(staleWhileRevalidate(IMMUTABLE_CACHE, request));
  }
  if (/\.(png|jpg|jpeg|svg|ico|css|woff2?|ttf)$/i.test(url.pathname)) {
    return event.respondWith(staleWhileRevalidate(DYNAMIC_CACHE, request));
  }
  if (url.pathname.startsWith('/api/')) {
    return event.respondWith(networkFirst(DYNAMIC_CACHE, request));
  }
  event.respondWith(staleWhileRevalidate(DYNAMIC_CACHE, request));
});
```

---

##  Background Sync y Notificaciones Push

### Implementación real

```js
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-entries') {
    event.waitUntil(syncEntries());
  }
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Notificación';
  const options = {
    body: data.body || 'Tienes un nuevo mensaje.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(urlToOpen));
});
```

### Justificación

Estas funciones garantizan que:
- Los datos almacenados en IndexedDB se sincronicen automáticamente cuando vuelve la red.
- El usuario reciba notificaciones push incluso con la app cerrada.
- Se mantenga la comunicación constante sin necesidad de recargar la página.

---

##  Instalación y ejecución local

```bash
git clone https://github.com/brayan3521110695/proyecto-brayan.git
npm install
npm run dev
cd server && npm install && node index.js
```

---

## 🧪 Pruebas realizadas

 **Offline:** formulario funcional sin conexión (IndexedDB).  
 **Background Sync:** al reconectarse se envían los datos pendientes.  
 **Página offline:** muestra mensaje personalizado.  
 **Push Notifications:** recibe notificación de prueba desde Render.  
 **Instalable:** confirmada en Chrome y Android.  
 **Lighthouse:** rendimiento y accesibilidad altos.  

---

##  Arquitectura del sistema

```
Usuario / Navegador
   │
   ▼
[ App Shell React ]
   │
   ▼
[ Service Worker ]
   ├─ Cache Storage (static, immutable, dynamic)
   ├─ IndexedDB (outbox)
   ├─ Background Sync
   └─ Push Notifications
       │
       ▼
[ Servidor Node/Render (API REST + Web Push) ]
       │
       ▼
[ Push Service del navegador ]

