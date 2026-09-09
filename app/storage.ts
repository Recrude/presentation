import type { Slide } from './model';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('jaeyeon-slide-studio', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('deck');
      r.result.createObjectStore('images');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error('다른 탭을 닫고 다시 시도하세요.'));
  });
}
async function read<T>(store: string, key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly'),
      req = tx.objectStore(store).get(key);
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
async function write(store: string, entries: [string, unknown][]) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    entries.forEach(([key, value]) => tx.objectStore(store).put(value, key));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export const readDeck = () => read<unknown>('deck', 'current');
export const saveDeck = (slides: Slide[]) =>
  write('deck', [['current', slides]]);
export const readImage = (id: string) => read<Blob>('images', id);
export const saveImages = (entries: [string, Blob][]) =>
  write('images', entries);

export async function readImages(ids: string[]): Promise<Record<string, Blob>> {
  if (!ids.length) return {};
  const db = await database();
  return new Promise((resolve, reject) => {
    const result: Record<string, Blob> = {};
    const tx = db.transaction('images', 'readonly');
    for (const id of ids) {
      const request = tx.objectStore('images').get(id);
      request.onsuccess = () => { if (request.result) result[id] = request.result; };
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
