// src/App.tsx
import { useEffect, useRef, useState } from "react";
import "./App.css";

import OfflineBadge from "./components/OfflineBadge";
import EntryForm from "./components/EntryForm";
import EntryList from "./components/EntryList";
import { registerSW, autoSyncOnOnline, ensurePushSubscribed, askNotificationPermission } from "./register-sw";

export default function App() {
  const [loading, setLoading] = useState(true);

  // ---- PWA install prompt ----
  const [canInstall, setCanInstall] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  // ---- Banner cuando el SW confirma que limpió la outbox ----
  const [syncedBanner, setSyncedBanner] = useState<{ visible: boolean; count: number }>({
    visible: false,
    count: 0,
  });

  // ---- Estado de notificaciones (UI) ----
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | "unsupported">(
    "default"
  );
  const [pushReady, setPushReady] = useState(false);

  // Pequeño splash inicial
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  // Registro del SW + autosync cuando vuelve la conexión
  useEffect(() => {
    let removeMessageListener: (() => void) | null = null;

    (async () => {
      await registerSW({
        onMessage: (msg) => {
          if (msg?.type === "OUTBOX_SENT") {
            const count = Array.isArray(msg.processedIds) ? msg.processedIds.length : Number(msg.count ?? 0);
            setSyncedBanner({ visible: true, count });
            setTimeout(() => setSyncedBanner({ visible: false, count: 0 }), 3000);
          }
        },
      });

      autoSyncOnOnline("sync-entries");

      const handler = (e: MessageEvent) => {
        const { type, processedIds, count } = (e.data || {}) as any;
        if (type === "OUTBOX_SENT") {
          const n = Array.isArray(processedIds) ? processedIds.length : Number(count ?? 0);
          setSyncedBanner({ visible: true, count: n });
          setTimeout(() => setSyncedBanner({ visible: false, count: 0 }), 3000);
        }
      };
      navigator.serviceWorker?.addEventListener("message", handler);
      removeMessageListener = () => navigator.serviceWorker?.removeEventListener("message", handler);
    })();

    return () => {
      if (removeMessageListener) removeMessageListener();
    };
  }, []);

  // Manejo del beforeinstallprompt (instalación PWA)
  useEffect(() => {
    const onBIP = (e: any) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  async function handleInstall() {
    const deferred = deferredPromptRef.current;
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferredPromptRef.current = null;
    setCanInstall(false);
  }

  // ---- Push: muestra estado inicial
  useEffect(() => {
    if (!("Notification" in window)) {
      setNotifStatus("unsupported");
      return;
    }
    setNotifStatus(Notification.permission);
  }, []);

  // ---- Botón: activar notificaciones / suscribir push
  async function handleEnablePush() {
    if (!("Notification" in window)) {
      setNotifStatus("unsupported");
      alert("Este navegador no soporta notificaciones.");
      return;
    }
    const perm = await askNotificationPermission();
    setNotifStatus(perm);
    if (perm !== "granted") return;

    const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapid) {
      alert("Falta VITE_VAPID_PUBLIC_KEY en .env");
      return;
    }

    try {
      const sub = await ensurePushSubscribed(vapid);
      if (sub) setPushReady(true);
    } catch (e) {
      console.warn("[Push] Error al suscribir:", e);
      alert("No se pudo activar Push (ver consola).");
    }
  }

  return (
    <>
      <header className="appbar">BrayanApp</header>

      {/* Banner SW outbox */}
      {syncedBanner.visible && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            padding: "10px 14px",
            background: "#15a34a",
            color: "white",
            borderRadius: 12,
            boxShadow: "0 6px 18px rgba(0,0,0,0.2)",
            zIndex: 50,
            fontWeight: 600,
          }}
          role="status"
          aria-live="polite"
        >
          ✔ Enviados y limpiados: {syncedBanner.count}
        </div>
      )}

      <main className="container">
        {loading ? (
          <div className="splash">
            <div className="logo" aria-label="logo" />
            <p>Cargando…</p>
          </div>
        ) : (
          <section style={{ display: "grid", gap: 16 }}>
            <OfflineBadge />

            <h1>Home</h1>
            <p>App Shell listo. Carga rápida y base para funcionar offline.</p>

            {canInstall && (
              <button id="installBtn" onClick={handleInstall}>
                Instalar
              </button>
            )}

            {/* Bloque pequeño para activar notificaciones */}
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
              }}
            >
              <strong>Notificaciones Push</strong>
              <div style={{ fontSize: 13, opacity: 0.85 }}>
                Estado permiso: <code>{String(notifStatus)}</code>
                {pushReady && <span> · ✅ Suscripción creada</span>}
              </div>
              <div style={{ marginTop: 8 }}>
                <button onClick={handleEnablePush}>🔔 Activar notificaciones</button>
              </div>
            </div>

            <hr />

            <h2>Reporte de actividades (offline)</h2>
            <EntryForm />
            <EntryList />
          </section>
        )}
      </main>
    </>
  );
}
