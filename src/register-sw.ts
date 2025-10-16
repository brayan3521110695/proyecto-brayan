// src/register-sw.ts

type SWOptions = {
  onMessage?: (data: any) => void;
  syncTag?: string;
};

export function isSWSupported(): boolean {
  return 'serviceWorker' in navigator;
}

const API_BASE =
  location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://proyecto-brayan.onrender.com';


export async function registerSW(opts: SWOptions = {}) {
  if (!isSWSupported()) return null;

  // Evita dobles registros
  if ((window as any).__swRegistering) {
    return (window as any).__swRegistering as Promise<ServiceWorkerRegistration>;
  }

  const registering = (async () => {
    try {
      const swUrl = `/service-worker.js?ts=${Date.now()}`;
      const reg = await navigator.serviceWorker.register(swUrl, {
        updateViaCache: 'none',
      });

      // Espera a que esté listo
      const readyReg = await navigator.serviceWorker.ready;

      try {
        await reg.update();
      } catch {}

      // Listener de mensajes del SW
      if (opts.onMessage) {
        const prev = (window as any).__swMsgHandler as
          | ((e: MessageEvent) => void)
          | undefined;
        if (prev) navigator.serviceWorker.removeEventListener('message', prev);

        const handler = (e: MessageEvent) => {
          try {
            opts.onMessage!(e.data);
          } catch {}
        };
        (window as any).__swMsgHandler = handler;
        navigator.serviceWorker.addEventListener('message', handler);
      }

      navigator.serviceWorker.addEventListener('controllerchange', () => {});

      return readyReg;
    } catch (e) {
      console.warn('[SW] no se pudo registrar', e);
      return null;
    }
  })();

  (window as any).__swRegistering = registering;
  const result = await registering;
  (window as any).__swRegistering = null;
  return result;
}

export async function requestSync(tag: string = 'sync-entries') {
  if (!isSWSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  if ('sync' in reg) {
    try {
      await (reg as any).sync.register(tag);
      return;
    } catch {}
  }
  reg.active?.postMessage({ type: 'SYNC_NOW', tag });
}

export async function syncNow(tag: string = 'sync-entries') {
  if (!isSWSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: 'SYNC_NOW', tag });
}

export function autoSyncOnOnline(tag: string = 'sync-entries') {
  if (!isSWSupported()) return;
  const handler = async () => {
    await requestSync(tag);
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function askNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'default') {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

function sameAppServerKey(sub: PushSubscription, targetKey: Uint8Array): boolean {
  try {
    const current = new Uint8Array((sub.options as any).applicationServerKey);
    if (current.byteLength !== targetKey.byteLength) return false;
    for (let i = 0; i < current.byteLength; i++) {
      if (current[i] !== targetKey[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function ensurePushSubscribed(
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  if (!isSWSupported()) return null;

  const permission = await askNotificationPermission();
  if (permission !== 'granted') {
    console.warn('[Push] Permiso no concedido:', permission);
    return null;
  }

  const reg = await navigator.serviceWorker.ready;
  const key = urlBase64ToUint8Array(vapidPublicKey);

  let sub = await reg.pushManager.getSubscription();

  if (sub && !sameAppServerKey(sub, key)) {
    try {
      await sub.unsubscribe();
    } catch {}
    sub = null;
  }

  // Crear nueva suscripción si no existe
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  }

  // Enviar al backend (Render o localhost)
  try {
    await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
  } catch (e) {
    console.warn('[Push] No se pudo guardar la suscripción en el backend:', e);
  }

  console.log('[Push] Subscription OK');
  return sub;
}
