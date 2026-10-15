// Your trades, saved in this browser (IndexedDB). Same database as the earlier versions, so old trades carry over.
let db;

export function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('divtracker', 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
      s.createIndex('ticker', 'ticker');
    };
    req.onsuccess = () => resolve((db = req.result));
    req.onerror = () => reject(req.error);
  });
}

const store = mode => db.transaction('transactions', mode).objectStore('transactions');
const done = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const plain = row => JSON.parse(JSON.stringify(row)); // screen (reactive) objects can't be saved directly

export const all = () => done(store('readonly').getAll());
export const add = row => done(store('readwrite').add(plain(row)));
export const put = row => done(store('readwrite').put(plain(row))); // update an existing trade (same id)
export const del = id => done(store('readwrite').delete(id));
