/**
 * Project persistence in IndexedDB. Screenshots and music stay as Blobs
 * (IndexedDB stores them natively), so a reload restores the whole video
 * without the base64 and quota problems of localStorage.
 */

import type { PersistStorage, StorageValue } from 'zustand/middleware';

const DB_NAME = 'iso-video';
const STORE_NAME = 'state';
const WRITE_DELAY = 400;

// Object URLs we created, so their Blobs can be saved
const blobsByUrl = new Map<string, Blob>();

export function createBlobUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  blobsByUrl.set(url, blob);
  return url;
}

export function revokeBlobUrl(url: string): void {
  if (!blobsByUrl.has(url)) return;
  URL.revokeObjectURL(url);
  blobsByUrl.delete(url);
}

/** Turns a data: URL into an object URL, decoding it once. */
export function dataUrlToBlobUrl(url: string): string {
  if (!url.startsWith('data:')) return url;
  return createBlobUrl(dataUrlToBlob(url));
}

function dataUrlToBlob(url: string): Blob {
  const comma = url.indexOf(',');
  const header = url.slice(5, comma);
  const type = header.split(';')[0] || 'application/octet-stream';
  const payload = url.slice(comma + 1);
  if (!header.includes(';base64')) return new Blob([decodeURIComponent(payload)], { type });
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

// URLs become Blobs on the way into IndexedDB and new object URLs on the way out
function toStored(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('blob:')) return blobsByUrl.get(value) ?? value;
    if (value.startsWith('data:')) return dataUrlToBlob(value);
    return value;
  }
  if (Array.isArray(value)) return value.map(toStored);
  if (value && typeof value === 'object' && !(value instanceof Blob)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toStored(v)]));
  }
  return value;
}

function fromStored(value: unknown): unknown {
  if (value instanceof Blob) return createBlobUrl(value);
  if (typeof value === 'string' && value.startsWith('blob:')) return ''; // dead URL from an old session
  if (Array.isArray(value)) return value.map(fromStored);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromStored(v)]));
  }
  return value;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * Zustand storage backed by IndexedDB. Writes are debounced so slider drags
 * don't queue a write per event, and flushed when the page is hidden.
 */
export function createProjectStorage<S>(version: number): PersistStorage<S> {
  const pending = new Map<string, StorageValue<S>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Nothing is written until the saved project has been read back, so an
  // early state change can't overwrite it with an empty project
  let loaded = false;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const [name, value] of pending) {
      pending.delete(name);
      run('readwrite', (store) => store.put(toStored(value), name)).catch((error) => {
        console.warn('Could not save the project', error);
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  return {
    getItem: async (name) => {
      try {
        const stored = await run('readonly', (store) => store.get(name));
        if (stored) return fromStored(stored) as StorageValue<S>;
      } catch (error) {
        console.warn('Could not load the saved project', error);
      } finally {
        loaded = true;
      }
      return readLegacy<S>(name, version);
    },
    setItem: (name, value) => {
      if (!loaded) return;
      pending.set(name, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, WRITE_DELAY);
    },
    removeItem: async (name) => {
      pending.delete(name);
      await run('readwrite', (store) => store.delete(name));
    },
  };
}

// Settings saved by older versions in localStorage, moved over once. They
// carry no version, so they are tagged with the current one to be merged
// instead of being dropped for lack of a migration.
function readLegacy<S>(name: string, version: number): StorageValue<S> | null {
  try {
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    localStorage.removeItem(name);
    const legacy = fromStored(JSON.parse(raw)) as StorageValue<S>;
    return { ...legacy, version };
  } catch {
    return null;
  }
}
