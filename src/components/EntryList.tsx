// src/components/EntryList.tsx
import { useEffect, useState } from 'react';
import {
  findAllEntries,
  deleteEntryAndMaybeOutbox,
  deleteEntriesByOutboxIds,   // ← ya lo usabas
  type Entry,
} from '../lib/db';
import { onEntriesChanged } from '../lib/events';

export default function EntryList() {
  const [items, setItems] = useState<Entry[]>([]);

  async function refresh() {
    const list = await findAllEntries();
    list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    setItems(list);
  }

  useEffect(() => {
    refresh();

    const onMsg = async (e: MessageEvent) => {
      const { type, processedIds } = e.data || {};
      if (type === 'OUTBOX_SENT') {
        // 💥 Borrar de entries los que se enviaron
        if (Array.isArray(processedIds) && processedIds.length) {
          await deleteEntriesByOutboxIds(processedIds);
        }
        await refresh();
      }
    };

    // 👉 refrescar cuando EntryForm guarda algo localmente
    const offLocal = onEntriesChanged(refresh);

    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMsg);
      offLocal();
    };
  }, []);

  return (
    <div>
      <ul>
        {items.map((it) => (
          <li key={it.id ?? `temp-${it.text}-${it.createdAt ?? ''}`}>
            {it.text}{' '}
            {it.pending && <em style={{ opacity: .7 }}>(pendiente)</em>}
            <button
              style={{ marginLeft: 8 }}
              onClick={async () => {
                if (it.id != null) {
                  await deleteEntryAndMaybeOutbox(it.id);
                  await refresh();
                }
              }}
            >
              Eliminar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
