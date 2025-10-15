// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// helpers del SW (ya tienes registerSW en tu proyecto)
import { registerSW, ensurePushSubscribed } from './register-sw';

// lee la clave pública VAPID desde variables de entorno (Vite)
const VAPID_PUBLIC: string = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/**
 * 1) Monta la app inmediatamente
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/**
 * 2) Registra el Service Worker y, si hay clave VAPID, intenta suscribirse a Push.
 *    No bloquea el render y evita fallar si no hay soporte/permiso.
 */
(async () => {
  try {
    await registerSW();

    if (VAPID_PUBLIC) {
      // opcional: espera un tick para asegurar que el controlador queda listo
      setTimeout(() => {
        ensurePushSubscribed(VAPID_PUBLIC)
          .catch((e) => console.warn('[Push] suscripción falló:', e));
      }, 0);
    } else {
      console.warn('[Push] Falta VITE_VAPID_PUBLIC_KEY en el entorno (.env)');
    }
  } catch (e) {
    console.warn('[SW] Registro de Service Worker falló:', e);
  }
})();
