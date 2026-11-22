// Mini-Speicher in IndexedDB – nur für den Service Worker (der kein localStorage lesen kann).
// Enthält ausschließlich die Zugangsdaten für den Abgleich ({ key, device }), damit Push-Benachrichtigungen
// die Änderung selbst abholen und anzeigen können. Alle anderen Daten bleiben in localStorage (storage.js).
// public/sw.js liest dieselbe Datenbank ("wall-e", Tabelle "kv").

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('wall-e', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbSet(key, value) {
  if (typeof indexedDB === 'undefined') return;
  const db = await open();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    if (value === null || value === undefined) tx.objectStore('kv').delete(key);
    else tx.objectStore('kv').put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
