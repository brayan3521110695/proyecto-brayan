import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'pwa-db-v3';
const DB_VERSION = 1;

export type Entry = {
  id?: number;
  text: string;
  createdAt?: number;
  pending?: boolean;
  outboxId?: number | null;
};

type AppDB = {
  entries: { key: number; value: Entry };
  outbox:  { key: number; value: any };
};

let _db: IDBPDatabase<AppDB> | null = null;
let cleanupDone = false;

async function cleanupLegacyDB() {
  if (cleanupDone) return;
  try { indexedDB.deleteDatabase('pwa-db'); } catch {}
  cleanupDone = true;
}

export async function getDB() {
  if (_db) return _db;

  await cleanupLegacyDB();

  _db = await openDB<AppDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('entries')) {
        db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
    },
  });

  return _db!;
}

/* entries */
export async function saveEntry(data: Entry) {
  const db = await getDB();
  return db.add('entries', { ...data, createdAt: data.createdAt ?? Date.now() });
}
export async function upsertEntry(entry: Entry) {
  const db = await getDB();
  return db.put('entries', { ...entry, createdAt: entry.createdAt ?? Date.now() });
}
export async function listEntries() {
  const db = await getDB();
  return db.getAll('entries');
}
export async function findAllEntries() {
  return listEntries();
}

/* outbox */
export async function queueForSync(data: any) {
  const db = await getDB();
  return db.add('outbox', { ...data, createdAt: Date.now(), synced: false });
}
export async function listOutbox() {
  const db = await getDB();
  return db.getAll('outbox');
}
export async function clearOutbox(ids: number[]) {
  const db = await getDB();
  const tx = db.transaction('outbox', 'readwrite');
  const store = tx.objectStore('outbox');
  await Promise.all(ids.map((id) => store.delete(id)));
  await tx.done;
}

/* sync helpers */
export async function markSyncedByOutboxIds(outboxIds: number[]) {
  if (!outboxIds?.length) return;
  const set = new Set(outboxIds);
  const db = await getDB();
  const tx = db.transaction('entries', 'readwrite');
  const store = tx.objectStore('entries');
  const all = await store.getAll();
  for (const e of all) {
    if (e.outboxId != null && set.has(e.outboxId)) {
      e.pending = false;
      e.outboxId = null;
      await store.put(e);
    }
  }
  await tx.done;
}

/* NUEVO: borrar de entries por outboxId (para que desaparezcan) */
export async function deleteEntriesByOutboxIds(outboxIds: number[]) {
  if (!outboxIds?.length) return;
  const set = new Set(outboxIds);
  const db = await getDB();
  const tx = db.transaction('entries', 'readwrite');
  const store = tx.objectStore('entries');
  const all = await store.getAll();
  for (const e of all) {
    if (e.id != null && e.outboxId != null && set.has(e.outboxId)) {
      await store.delete(e.id);
    }
  }
  await tx.done;
}

export async function deleteEntryAndMaybeOutbox(entryId: number) {
  const db = await getDB();
  const tx = db.transaction(['entries', 'outbox'], 'readwrite');
  const entries = tx.objectStore('entries');
  const outbox = tx.objectStore('outbox');
  const e = await entries.get(entryId);
  if (e?.outboxId != null) await outbox.delete(e.outboxId);
  await entries.delete(entryId);
  await tx.done;
}
