/**
 * Durable home for the workspace snapshot.
 *
 * localStorage is capped at roughly 5 MB per origin, and a long-lived workspace
 * (many rooms, hundreds of messages, memory, backups of its own extensions) can
 * fill it. Once full, snapshot writes fail and every message added since the
 * last successful write is gone after a reload. IndexedDB has a far larger
 * quota, so the snapshot lives there and localStorage is only a fallback.
 */
export interface SnapshotBackend {
  /** The stored snapshot JSON, or null when nothing has been stored. */
  read(): Promise<string | null>;
  /** Resolves true only once the write is durably committed. */
  write(json: string): Promise<boolean>;
}

const DB_NAME = 'virtual-company';
const STORE = 'workspace';
const RECORD_KEY = 'snapshot';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

export function createIndexedDbBackend(): SnapshotBackend | null {
  if (typeof indexedDB === 'undefined') return null;

  let opening: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
      request.onblocked = () => reject(new Error('IndexedDB open was blocked.'));
    }).catch(error => {
      opening = null;
      throw error;
    });
    return opening;
  };

  return {
    async read() {
      const db = await open();
      const value = await requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(RECORD_KEY));
      return typeof value === 'string' ? value : null;
    },
    async write(json) {
      const db = await open();
      return new Promise<boolean>(resolve => {
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put(json, RECORD_KEY);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      });
    },
  };
}
