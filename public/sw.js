// Wall-E Service Worker – nur für Push-Benachrichtigungen von „Gemeinsam nutzen“.
// Er speichert bewusst nichts zwischen (kein fetch-Handler), damit nie eine alte App-Version geladen wird.
//
// Der Push selbst ist leer. Der Service Worker holt die offenen Änderungen beim eigenen Server ab,
// entschlüsselt sie hier auf dem Gerät (gleiche Ableitung wie src/lib/crypto.js) und zeigt den Text an.
// Übernommen oder abgelehnt wird erst in der App.

const enc = new TextEncoder();
const dec = new TextDecoder();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function fromB64u(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function toB64u(bytes) {
  let binary = '';
  new Uint8Array(bytes).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readConfig() {
  return new Promise((resolve) => {
    const request = indexedDB.open('wall-e', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('kv').objectStore('kv').get('sync');
      get.onsuccess = () => {
        resolve(get.result || null);
        db.close();
      };
      get.onerror = () => resolve(null);
    };
  });
}

async function pendingTexts() {
  const config = await readConfig();
  if (!config) return [];
  const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('wall-e-sync-v1'), info: enc.encode(info) });
  const base = await crypto.subtle.importKey('raw', fromB64u(config.key), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const group = toB64u(await crypto.subtle.deriveBits(hkdf('group'), base, 256));
  const auth = toB64u(await crypto.subtle.deriveBits(hkdf('auth'), base, 256));
  const aes = await crypto.subtle.deriveKey(hkdf('aes'), base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const response = await fetch('/api/sync.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pull', group, auth, device: config.device })
  });
  if (!response.ok) return [];
  const { events } = await response.json();
  const texts = [];
  for (const event of events || []) {
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(event.iv), additionalData: enc.encode(group) }, aes, fromB64u(event.data));
      texts.push(JSON.parse(dec.decode(plain)).text);
    } catch {
      // nicht lesbar – die App räumt es auf
    }
  }
  return texts.filter(Boolean);
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let texts = [];
      try {
        texts = await pendingTexts();
      } catch {
        texts = [];
      }
      // Offene App-Fenster sofort abgleichen lassen
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      windows.forEach((client) => client.postMessage({ type: 'wall-e-sync' }));
      const title = texts.length > 1 ? `${texts.length} Änderungen in Wall-E` : 'Wall-E';
      const body = texts.length ? texts.slice(-4).join('\n') : 'Es gibt eine neue Änderung von einem anderen Gerät.';
      await self.registration.showNotification(title, {
        body,
        tag: 'wall-e-sync',
        renotify: true,
        icon: '/manifest-icon-192.maskable.png',
        badge: '/favicon-196.png',
        data: { url: '/' }
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => 'focus' in client);
      if (open) {
        open.postMessage({ type: 'wall-e-sync' });
        return open.focus();
      }
      return self.clients.openWindow('/');
    })()
  );
});
