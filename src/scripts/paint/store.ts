// Paint keeps the picture you're working on in this browser (IndexedDB), so
// closing the window or the tab doesn't lose it. Nothing leaves the device
// until you press Send. File ▸ New clears it. Every call fails quietly
// (private browsing, storage turned off): the picture then lives only in the page.

const DB = 'kus98-paint';
const STORE = 'pictures';
const KEY = 'current';

export interface Kept { blob: Blob; w: number; h: number; title: string; at: number }

let opening: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
  opening.catch(() => (opening = null));
  return opening;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function keep(k: Kept): Promise<void> {
  try { await run('readwrite', (s) => s.put(k, KEY)); } catch { /* memory only */ }
}

export async function kept(): Promise<Kept | null> {
  try {
    const k = await run<Kept | undefined>('readonly', (s) => s.get(KEY));
    return k && k.blob instanceof Blob ? k : null;
  } catch {
    return null;
  }
}

export async function forget(): Promise<void> {
  try { await run('readwrite', (s) => s.delete(KEY)); } catch { /* nothing kept */ }
}
