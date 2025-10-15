// src/components/EntryForm.tsx
import { useEffect, useState } from 'react';
// 👇 Usa nuestro módulo único de IDB
import { queueForSync, upsertEntry } from '../lib/db';    // ← encola en outbox y guarda en entries
import { registerSW, requestSync } from '../register-sw';
import { sendEntryOnline } from '../api/entries';
import { notifyEntriesChanged } from '../lib/events';

export default function EntryForm() {
  const [form, setForm] = useState({ title: '', note: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { registerSW(); }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    const payload = { title: form.title, note: form.note };
    const text = `${form.title} — ${form.note}`;

    const saveOffline = async () => {
      console.log('[UI] Offline -> guardando en outbox & entries', payload);

      // 1) Encolar en outbox y quedarnos con el id
      const outboxId = await queueForSync(payload);
      console.log('[UI] outbox id =', outboxId);

      // 2) Guardar copia local para la lista con pending=true
      await upsertEntry({
        text,
        pending: true,
        outboxId,
        createdAt: Date.now(),
      });

      // 👉 3) Notificar a la lista que hay cambios (sin botón)
      notifyEntriesChanged();

      // 4) Registrar background sync (o fallback por mensaje)
      await requestSync('sync-entries');
    };

    try {
      console.log('[UI] navigator.onLine =', navigator.onLine);
      if (navigator.onLine) {
        await sendEntryOnline(payload);
        // Si quisieras reflejar también los enviados online en la lista local:
        // await upsertEntry({ text, pending: false, outboxId: null, createdAt: Date.now() });
        // notifyEntriesChanged();
      } else {
        await saveOffline();
      }
    } catch (err) {
      console.warn('[UI] Falla envío online, fallback a offline', err);
      try {
        await saveOffline();
      } catch (e) {
        console.error('[UI] Error guardando en IDB', e);
        alert('No se pudo guardar offline. Revisa la consola.');
      }
    } finally {
      setForm({ title: '', note: '' });
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input
        value={form.title}
        onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
        placeholder="Título"
        required
      />
      <input
        value={form.note}
        onChange={e => setForm(s => ({ ...s, note: e.target.value }))}
        placeholder="Nota"
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}
