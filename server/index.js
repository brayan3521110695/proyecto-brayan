const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
require('dotenv').config(); // lee variables de entorno desde server/.env si existe

const app = express();
app.use(cors());
app.use(express.json());

// --- VAPID keys ---
// GUARDA estas variables SOLO en el backend (no las pongas en el frontend):
// En Windows (PowerShell) puedes setearlas así para probar temporalmente:
//   $env:VAPID_PUBLIC_KEY="TU_PUBLIC_KEY"
//   $env:VAPID_PRIVATE_KEY="TU_PRIVATE_KEY"
// O crea un archivo server/.env con:
//   VAPID_PUBLIC_KEY=BEY...P1k
//   VAPID_PRIVATE_KEY=yg3...93Y
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn('[Push] Falta VAPID_PUBLIC_KEY y/o VAPID_PRIVATE_KEY en el backend');
}

webpush.setVapidDetails(
  'mailto:tu-correo@ejemplo.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// --- DEMO almacenamiento en memoria (en producción: base de datos) ---
const subscriptions = new Set();

// ===============================================
//  Rutas existentes (las que ya tenías)
// ===============================================
app.post('/api/entries', (req, res) => {
  // TODO: guardar en DB real
  res.status(201).json({ ok: true });
});

app.post('/api/entries/batch', (req, res) => {
  const { items = [] } = req.body || {};
  // TODO: inserción masiva en DB
  res.status(201).json({ ok: true, received: items.length });
});

// ===============================================
//  NUEVAS rutas para Push
// ===============================================

// Guarda la suscripción que manda el frontend (ensurePushSubscribed)
app.post('/api/push/subscribe', (req, res) => {
  try {
    const sub = req.body;
    // Validación mínima
    if (!sub || !sub.endpoint) {
      return res.status(400).json({ ok: false, error: 'Suscripción inválida' });
    }
    subscriptions.add(sub);
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[Push] error al guardar suscripción', e);
    return res.status(500).json({ ok: false });
  }
});

// Envía una notificación de prueba a todas las suscripciones guardadas
app.post('/api/push/test', async (req, res) => {
  const payload = {
    title: 'Hola desde VAPID 🎉',
    body: 'Notificación de prueba',
    url: '/',  // se abre al click
    tag: 'demo',
  };

  const results = [];
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      results.push({ ok: true });
    } catch (e) {
      console.error('[Push] error al enviar a un sub:', e?.body || e);
      results.push({ ok: false, error: String(e) });
    }
  }
  res.json({ sent: results.length, results });
});

// ===============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
