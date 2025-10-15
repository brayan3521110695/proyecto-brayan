// src/idb/entriesStore.ts
const DB_NAME = 'pwa-db-v3';
const DB_VERSION = 1;
const OUTBOX = 'outbox';
const ENTRIES = 'entries';

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX)) {
        db.createObjectStore(OUTBOX, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(ENTRIES)) {
        db.createObjectStore(ENTRIES, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      res(db);
    };
    req.onerror = () => rej(req.error);
  });
}

/**
 * Guarda offline:
 *  1) En OUTBOX (para sync)
 *  2) En ENTRIES con { pending:true, outboxId:<id> } para que la UI lo muestre como “pendiente”
 * Devuelve { outboxId, entryId }
 */
export async function addToOutboxAndEntries(payload: any) {
  const db = await openDB();

  // Paso 1: OUTBOX
  const tx1 = db.transaction(OUTBOX, 'readwrite');
  const outboxStore = tx1.objectStore(OUTBOX);
  const outboxId: number = await new Promise((res, rej) => {
    const r = outboxStore.add({ ...payload, createdAt: Date.now() });
    r.onsuccess = () => res(r.result as number);
    r.onerror = () => rej(r.error);
  });
  await new Promise<void>((res, rej) => {
    tx1.oncomplete = () => res();
    tx1.onabort = () => rej(tx1.error);
  });

  // Paso 2: ENTRIES (reflejamos pendiente)
  const tx2 = db.transaction(ENTRIES, 'readwrite');
  const entriesStore = tx2.objectStore(ENTRIES);
  const entryId: number = await new Promise((res, rej) => {
    const r = entriesStore.add({
      text: payload.title
        ? `${payload.title} — ${payload.note ?? ''}`.trim()
        : payload.text ?? '',
      title: payload.title, // si quieres conservar títulos por separado
      note: payload.note,
      createdAt: Date.now(),
      pending: true,
      outboxId,
    });
    r.onsuccess = () => res(r.result as number);
    r.onerror = () => rej(r.error);
  });
  await new Promise<void>((res, rej) => {
    tx2.oncomplete = () => res();
    tx2.onabort = () => rej(tx2.error);
  });

  db.close?.();
  return { outboxId, entryId };
}
