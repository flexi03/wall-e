// „Gemeinsam nutzen“: Änderungen verschlüsselt über server/api/sync.php an die anderen Geräte schicken
// und deren Änderungen abholen. Ohne React – die Oberfläche steckt in hooks/sync.js.
import * as store from './storage.js';
import { deriveGroup, encryptJson, decryptJson, fromB64u, newGroupKey, randomId, isGroupKey } from './crypto.js';
import { idbSet } from './idb.js';
import { describeChange, myName } from './syncText.js';
import { buildPayload, applyPayload } from './share.js';

let cache = null;
async function derived(sync) {
  if (!cache || cache.key !== sync.key) cache = { key: sync.key, value: await deriveGroup(sync.key) };
  return cache.value;
}

function failure(message, transient) {
  const error = new Error(message);
  error.transient = transient;
  return error;
}

async function call(action, extra = {}, retried = false) {
  const sync = store.getSync();
  if (!sync) throw failure('Gemeinsam nutzen ist nicht eingerichtet', false);
  const { group, auth } = await derived(sync);
  let response;
  try {
    response = await fetch('/api/sync.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action, group, auth, device: sync.device, ...extra })
    });
  } catch {
    throw failure('Keine Internetverbindung', true);
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // keine JSON-Antwort
  }
  // Ein anderes Gerät hat dieses entfernt → hier aufräumen (eigene Daten bleiben)
  if (response.status === 403 && data && data.error === 'Gerät wurde entfernt') {
    await idbSet('sync', null).catch(() => {});
    store.clearSync();
    store.setSyncRemoved(new Date().toISOString());
    throw failure('Dieses Gerät wurde aus „Gemeinsam nutzen“ entfernt.', false);
  }
  // Gerät war zu lange weg und wurde entfernt → neu anmelden und noch einmal versuchen
  if ((response.status === 409 || response.status === 404) && action !== 'join' && !retried) {
    await join();
    return call(action, extra, true);
  }
  if (!response.ok) throw failure((data && data.error) || `Abgleich nicht möglich (${response.status})`, response.status >= 500);
  return data;
}

// ---------- Einrichten ----------

// Was die anderen in der Geräteliste sehen – verschlüsselt, der Server kennt es nicht
export function deviceLabel(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', standalone = false) {
  const kind = /iPad/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Gerät';
  if (standalone) return `${kind} · App`;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${kind} · ${browser}`;
}

function isStandaloneNow() {
  if (typeof window === 'undefined') return false;
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

export async function join() {
  const sync = store.getSync();
  const keys = await derived(sync);
  const meta = await encryptJson(keys, { name: myName(), me: store.getMe(), label: deviceLabel(undefined, isStandaloneNow()) });
  const result = await call('join', { meta });
  await idbSet('sync', { key: sync.key, device: sync.device });
  store.updateSync({ devices: result.devices, vapidKey: result.vapidKey });
  return result;
}

// Einladung annehmen: nur der Schlüssel – die Daten auf diesem Gerät bleiben unverändert
export async function joinWithKey(key) {
  if (!isGroupKey(key)) throw failure('Diese Einladung ist ungültig.', false);
  const current = store.getSync();
  if (!current || current.key !== key) store.setSync({ key, device: randomId(), auto: true, notify: false });
  store.setSyncRemoved(null);
  return join();
}

// Alle Geräte mit Namen (entschlüsselt); nicht lesbare erscheinen als „Unbekanntes Gerät“
export async function listDevices() {
  const { devices } = await call('devices');
  const keys = await derived(store.getSync());
  const me = store.getSync().device;
  const list = [];
  for (const d of devices) {
    let meta = null;
    try {
      meta = d.meta ? await decryptJson(keys, d.meta) : null;
    } catch {
      meta = null;
    }
    list.push({ id: d.id, mine: d.id === me, seen: d.seen * 1000, since: d.since * 1000, push: d.push, name: meta && meta.name ? meta.name : 'Unbekannt', person: meta ? meta.me : null, label: meta && meta.label ? meta.label : 'Unbekanntes Gerät' });
  }
  return list;
}

// Personen mit ihren Geräten, „ich“ zuerst
export function groupDevices(devices) {
  const groups = new Map();
  devices.forEach((d) => {
    const key = d.person || `name:${d.name}`;
    if (!groups.has(key)) groups.set(key, { key, name: d.name, mine: false, devices: [] });
    const group = groups.get(key);
    group.devices.push(d);
    if (d.mine) group.mine = true;
  });
  return [...groups.values()].sort((a, b) => (a.mine === b.mine ? a.name.localeCompare(b.name, 'de') : a.mine ? -1 : 1));
}

export async function removeDevice(target) {
  await call('remove', { target });
}

export async function startSync() {
  store.setSync({ key: newGroupKey(), device: randomId(), auto: true, notify: false });
  store.setSyncRemoved(null);
  return join();
}

export async function leaveSync() {
  try {
    await disablePush();
    await call('leave');
  } catch {
    // offline: das Gerät verschwindet nach 60 Tagen von selbst
  }
  await idbSet('sync', null).catch(() => {});
  store.clearSync();
}

export { isGroupKey };

// ---------- Senden ----------

export function buildChange(type, data, now = new Date()) {
  const name = myName();
  return { v: 1, id: randomId(12), at: now.toISOString(), by: { name, device: store.getSync().device }, type, data, text: describeChange(type, data, name) };
}

// Änderungen kurz sammeln: gleiche Bereiche überschreiben sich, Zuordnungen werden zusammengeführt
export function queueChange(outbox, change) {
  const list = [...outbox];
  const same = list.findIndex((c) => c.type === change.type && c.type !== 'profile');
  if (same === -1) return [...list, change];
  if (change.type === 'owners') {
    const merged = { ...list[same].data.changes, ...change.data.changes };
    const data = { changes: merged };
    list[same] = { ...change, data, text: describeChange('owners', data, change.by.name) };
  } else {
    list[same] = change;
  }
  return list;
}

export function queueLocalChange(type, data) {
  const change = buildChange(type, data);
  store.setSyncOutbox(queueChange(store.getSyncOutbox(), change));
}

export async function flushOutbox() {
  const sync = store.getSync();
  if (!sync) return 0;
  const keys = await derived(sync);
  let sent = 0;
  for (const change of store.getSyncOutbox()) {
    const sealed = await encryptJson(keys, change);
    await call('send', { event: { id: change.id, ...sealed } });
    store.setSyncOutbox(store.getSyncOutbox().filter((c) => c.id !== change.id));
    sent += 1;
  }
  return sent;
}

// Kompletter Stand (Abrechnungen, Personen, Zuordnungen, Preise) an alle – z. B. direkt nach dem Einladen.
// Die anderen werden immer gefragt, auch wenn sie „automatisch übernehmen“ eingeschaltet haben.
export const SNAPSHOT_SECTIONS = ['prices', 'billing', 'people'];

export async function sendSnapshot() {
  const change = buildChange('snapshot', buildPayload(SNAPSHOT_SECTIONS).data);
  store.setSyncOutbox([...store.getSyncOutbox().filter((c) => c.type !== 'snapshot'), change]);
  return flushOutbox();
}

// Stand eines anderen Geräts übernehmen (rückgängig machbar wie ein Import). „Das bin ich“ bleibt erhalten.
export function applySnapshot(change) {
  const meBefore = store.getMe();
  const meName = meBefore && !meBefore.startsWith('card:') ? (store.getProfiles().find((p) => p.id === meBefore) || {}).name : null;
  applyPayload({ format: 'wall-e', version: 1, data: change.data }, SNAPSHOT_SECTIONS);
  if (meBefore && !meBefore.startsWith('card:') && !store.getProfiles().some((p) => p.id === meBefore)) {
    const same = meName ? store.getProfiles().find((p) => p.name === meName) : null;
    store.setMe(same ? same.id : null);
  }
  store.markSynced(['billing', 'prices', 'settings'], change.at);
  return true;
}

// ---------- Empfangen ----------

export async function pullChanges() {
  const result = await call('pull');
  const sync = store.getSync();
  if (sync && sync.devices !== result.devices) store.updateSync({ devices: result.devices });
  const keys = await derived(store.getSync());
  const changes = [];
  const unreadable = [];
  for (const event of result.events) {
    try {
      const change = await decryptJson(keys, event);
      if (change && change.type && change.id === event.id) changes.push(change);
      else unreadable.push(event.id);
    } catch {
      unreadable.push(event.id);
    }
  }
  if (unreadable.length) await call('ack', { ids: unreadable });
  return changes.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export async function ackChanges(ids) {
  if (ids.length) await call('ack', { ids });
}

// ---------- Benachrichtigungen ----------

export function pushSupport() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// Muss direkt aus einem Tippen heraus aufgerufen werden (Safari fragt sonst nicht nach)
export async function enablePush() {
  if (pushSupport() === 'unsupported') throw failure('Dieser Browser kann keine Benachrichtigungen empfangen.', false);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw failure('Benachrichtigungen wurden nicht erlaubt. Das lässt sich in den Einstellungen des Handys ändern.', false);
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let { vapidKey } = store.getSync();
  if (!vapidKey) vapidKey = (await join()).vapidKey;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(vapidKey) });
  await call('subscribe', { endpoint: subscription.endpoint });
  store.updateSync({ notify: true });
}

export async function disablePush() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = registration && registration.pushManager ? await registration.pushManager.getSubscription() : null;
    if (subscription) await subscription.unsubscribe();
  }
  if (store.getSync() && store.getSync().notify) {
    await call('subscribe', { endpoint: null }).catch(() => {});
    store.updateSync({ notify: false });
  }
}
