// Zentrale Datenschicht für alles, was Wall-E im Browser speichert (localStorage).
//
// Wichtig: V2 benutzt bewusst dieselben Schlüssel und Formate wie V1. So bleiben
// vorhandene Daten ohne Migration erhalten, und ein Zurückrollen auf V1 ist jederzeit
// möglich. Neue Werte bekommen neue Schlüssel mit Präfix "wall_e_".
// Übersicht aller Schlüssel: docs/DATA.md
import { STANDARD_LOSS } from './billing.js';

export const KEYS = {
  // Wallbox-Zugang (V1)
  serial: 'goe_serial_number',
  token: 'goe_api_token',
  demo: 'wall_e_demo',
  // Strompreis (V1)
  price: 'kwh_price',
  priceHistory: 'kwh_price_history',
  // Zähler und Abrechnung (V1)
  currentMeter: 'energy_meter_reading',
  currentMeterAt: 'energy_meter_timestamp',
  startMeter: 'before_meter_reading',
  startMeterAt: 'before_meter_timestamp',
  baseline: 'billing_baseline',
  periods: 'billing_periods',
  snapshots: 'saved_stats', // V1-"Snapshots" = alte Sicherungen, nur noch lesend
  // Darstellung (V1): true/false; fehlt der Schlüssel, gilt das System-Design
  darkMode: 'darkMode',
  // Neu in V2
  wallboxName: 'wall_e_wallbox_name',
  importUndo: 'wall_e_import_undo',
  profiles: 'wall_e_profiles', // [{ id, name, cards: [Kartenname], createdAt }]
  sessionOwners: 'wall_e_session_owners', // { Ladevorgangs-ID: Profil-ID }
  unassignedMode: 'wall_e_unassigned_mode', // 'separate' | 'split'
  me: 'wall_e_me', // Profil dieses Geräts ("Das bin ich") – wird nicht geteilt
  sessions: 'wall_e_sessions', // Zwischenspeicher des go-e Ladeverlaufs
  sessionsAt: 'wall_e_sessions_at',
  sessionsFrom: 'wall_e_sessions_from', // ab wann der Ladeverlauf vollständig geladen wurde (ISO)
  standardLoss: 'wall_e_standard_loss', // pauschaler Ladeverlust in %, solange keine Messung möglich ist
  // Gemeinsam nutzen (ab 2.1): Schlüssel/Gerät, offene Änderungen anderer, noch nicht gesendete, Zeitstempel
  sync: 'wall_e_sync', // { key, device, auto, notify }
  syncInbox: 'wall_e_sync_inbox',
  syncOutbox: 'wall_e_sync_outbox',
  syncStamps: 'wall_e_sync_stamps',
  syncRemoved: 'wall_e_sync_removed', // Zeitpunkt, an dem ein anderes Gerät dieses entfernt hat (Hinweis)
  historyLink: 'wall_e_history_link', // Export-Link, falls die Wallbox keinen liefert
  welcome: 'wall_e_welcome', // zuletzt gezeigter Willkommens-Bildschirm (Version)
  seenVersion: 'wall_e_seen_version', // App-Version, deren Neuerungen zuletzt gezeigt wurden
  backupV1: 'wall_e_backup_v1' // automatische Sicherung beim ersten Start von V2
};

// Altlasten aus V1, die V2 nicht mehr benutzt. Sie bleiben unangetastet liegen
// (nur "Alle Daten löschen" entfernt sie).
export const LEGACY_KEYS = ['wallbox_sessions', 'wallbox_card_energies', 'goe_auth_cookies', 'goe_export_url'];

export const DEFAULT_PRICE = 0.39; // wie V1, wenn noch kein Preis gespeichert ist

const listeners = new Set();

// Komponenten melden sich hier an und rendern neu, sobald sich gespeicherte Daten ändern
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener());
}

// ---------- Änderungen für „Gemeinsam nutzen“ ----------
//
// Jede Schreibfunktion, deren Ergebnis andere Geräte sehen sollen, meldet hier eine Änderung.
// Beim Einspielen fremder Änderungen (applyRemote) wird nichts gemeldet – sonst ginge es hin und her.
const changeListeners = new Set();
let applyingRemote = false;

export function onLocalChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function emitChange(type, data) {
  if (applyingRemote) return;
  const sync = getSync();
  if (!sync) return;
  if (STAMPED.includes(type)) setStamp(type, new Date().toISOString());
  changeListeners.forEach((listener) => listener(type, data));
}

// Änderungen aus einem anderen Tab übernehmen
if (typeof window !== 'undefined') {
  window.addEventListener('storage', notify);
}

export function getRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setRaw(key, value) {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(value));
    }
  } finally {
    notify();
  }
}

export function getJson(key, fallback) {
  const raw = getRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setJson(key, value) {
  setRaw(key, value === null || value === undefined ? null : JSON.stringify(value));
}

// Mehrere Schlüssel schreiben und erst danach einmal benachrichtigen
export function batch(fn) {
  let changed = false;
  try {
    fn({
      set: (key, value) => {
        changed = true;
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, String(value));
      },
      setJson: (key, value) => {
        changed = true;
        if (value === null || value === undefined) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
      }
    });
  } finally {
    if (changed) notify();
  }
}

// Zahlen kommen aus Eingabefeldern mit Komma oder Punkt ("0,39" und "0.39")
export function parseNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || !/^-?\d*\.?\d+$/.test(normalized)) return NaN;
  return parseFloat(normalized);
}

// V1 speicherte die Basislinie zeitweise als { users: [...] } – auf { totalEnergyKwh, meterReading } bringen
export function normalizeBaseline(b) {
  if (!b || typeof b !== 'object') return { totalEnergyKwh: null, meterReading: null };
  if (typeof b.totalEnergyKwh === 'number') {
    return { ...b, meterReading: b.meterReading ?? null };
  }
  if (Array.isArray(b.users)) {
    const total = b.users.reduce((sum, u) => sum + (u.rawEnergyKwh || 0), 0);
    return { totalEnergyKwh: total, meterReading: b.meterReading ?? null };
  }
  return { totalEnergyKwh: null, meterReading: b.meterReading ?? null };
}

function normalizePeriod(p) {
  return {
    ...p,
    note: p.note || '',
    userBreakdown: Array.isArray(p.userBreakdown) ? p.userBreakdown : [],
    baselineBefore: p.baselineBefore ? normalizeBaseline(p.baselineBefore) : null,
    baselineAfter: p.baselineAfter ? normalizeBaseline(p.baselineAfter) : null
  };
}

// ---------- Wallbox ----------

export function isDemoMode() {
  return getRaw(KEYS.demo) === '1';
}

export function setDemoMode(enabled) {
  setRaw(KEYS.demo, enabled ? '1' : null);
}

export function getWallbox() {
  const serial = getRaw(KEYS.serial) || '';
  const token = getRaw(KEYS.token) || '';
  return {
    serial,
    token,
    name: getRaw(KEYS.wallboxName) || '',
    isConfigured: !!(serial && token)
  };
}

export function saveWallbox({ serial, token, name }) {
  batch(({ set }) => {
    set(KEYS.serial, serial.trim());
    set(KEYS.token, token.trim());
    set(KEYS.wallboxName, name && name.trim() ? name.trim() : null);
    set(KEYS.demo, null);
  });
}

export function clearWallbox() {
  batch(({ set }) => {
    set(KEYS.serial, null);
    set(KEYS.token, null);
    set(KEYS.demo, null);
  });
}

// ---------- Strompreis ----------

export function getPrice() {
  const value = parseNumber(getRaw(KEYS.price));
  return { value: value > 0 ? value : DEFAULT_PRICE, isSet: value > 0 };
}

export function getPriceHistory() {
  const history = getJson(KEYS.priceHistory, []);
  return Array.isArray(history) ? history.filter((p) => p && typeof p.price === 'number') : [];
}

export function setActivePrice(price) {
  setRaw(KEYS.price, String(price));
  emitChange('prices', pricesSnapshot());
}

export function addPrice(label, price) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: label && label.trim() ? label.trim() : `Tarif ${formatPlain(price)} €`,
    price,
    createdAt: new Date().toISOString()
  };
  batch(({ set, setJson: sj }) => {
    sj(KEYS.priceHistory, [entry, ...getPriceHistory()]);
    set(KEYS.price, String(price));
  });
  emitChange('prices', pricesSnapshot());
  return entry;
}

export function updatePrice(id, changes) {
  setJson(KEYS.priceHistory, getPriceHistory().map((p) => (p.id === id ? { ...p, ...changes } : p)));
  emitChange('prices', pricesSnapshot());
}

export function deletePrice(id) {
  setJson(KEYS.priceHistory, getPriceHistory().filter((p) => p.id !== id));
  emitChange('prices', pricesSnapshot());
}

function pricesSnapshot() {
  return { price: getRaw(KEYS.price), history: getJson(KEYS.priceHistory, []) };
}

function formatPlain(n) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

// ---------- Zähler & Abrechnung ----------

export function getBaseline() {
  return normalizeBaseline(getJson(KEYS.baseline, null));
}

export function getMeters() {
  const baseline = getBaseline();
  const legacyStart = parseNumber(getRaw(KEYS.startMeter));
  const current = parseNumber(getRaw(KEYS.currentMeter));
  // Startwert der laufenden Abrechnung: V1 hat beim Abschließen nur die Basislinie
  // fortgeschrieben, "before_meter_reading" blieb alt stehen. Die Basislinie ist daher maßgeblich.
  const baselineMeter = parseNumber(baseline.meterReading);
  const start = !isNaN(baselineMeter) ? baselineMeter : legacyStart;
  return {
    start: isNaN(start) ? null : start,
    startAt: getRaw(KEYS.startMeterAt),
    current: isNaN(current) ? null : current,
    currentAt: getRaw(KEYS.currentMeterAt)
  };
}

// at = Zeitpunkt der Ablesung (ISO), Standard: jetzt
export function setCurrentMeter(value, at) {
  batch(({ set }) => {
    set(KEYS.currentMeter, value === null ? null : String(value));
    set(KEYS.currentMeterAt, value === null ? null : at || new Date().toISOString());
  });
  if (value !== null) emitChange('meter', { current: getRaw(KEYS.currentMeter), currentAt: getRaw(KEYS.currentMeterAt) });
}

// Startwert setzen (V1: "Baseline speichern"): merkt sich zugleich den aktuellen Wallbox-Stand
export function setStartMeter(value, wallboxTotals) {
  const baseline = {
    totalEnergyKwh: wallboxTotals.totalKwh,
    meterReading: value,
    cards: wallboxTotals.cards,
    at: new Date().toISOString()
  };
  batch(({ set, setJson: sj }) => {
    set(KEYS.startMeter, String(value));
    set(KEYS.startMeterAt, new Date().toISOString());
    sj(KEYS.baseline, baseline);
  });
  emitChange('billing', { what: 'start', ...billingSnapshot() });
}

// Nur die Zahl des Startwerts korrigieren. Kartenstände und Beginn der Abrechnung bleiben:
// periodStartMs = bisheriger Beginn, wird in der Basislinie festgehalten (sonst würde er sich verschieben).
export function correctStartMeter(value, periodStartMs = null) {
  const baseline = getBaseline();
  const at = baseline.at || (typeof periodStartMs === 'number' && !isNaN(periodStartMs) ? new Date(periodStartMs).toISOString() : null);
  batch(({ set, setJson: sj }) => {
    set(KEYS.startMeter, String(value));
    sj(KEYS.baseline, { ...baseline, meterReading: value, ...(at ? { at } : {}) });
  });
  emitChange('billing', { what: 'start', ...billingSnapshot() });
}

// Pauschaler Ladeverlust (Anteil, z. B. 0.016), solange der Hauszähler keine plausible Messung erlaubt
export function getStandardLoss() {
  const percent = parseNumber(getRaw(KEYS.standardLoss));
  return percent >= 0 && percent <= 20 ? percent / 100 : STANDARD_LOSS;
}

export function setStandardLoss(percent) {
  setRaw(KEYS.standardLoss, percent === null || isNaN(percent) ? null : String(percent));
  emitChange('settings', { what: 'loss', ...settingsSnapshot() });
}

function settingsSnapshot() {
  return { unassignedMode: getRaw(KEYS.unassignedMode), standardLoss: getRaw(KEYS.standardLoss) };
}

// Rohwerte (genau die V1-Formate) für den Abgleich
function billingSnapshot() {
  return {
    baseline: getJson(KEYS.baseline, null),
    startMeter: getRaw(KEYS.startMeter),
    startMeterAt: getRaw(KEYS.startMeterAt),
    currentMeter: getRaw(KEYS.currentMeter),
    currentMeterAt: getRaw(KEYS.currentMeterAt),
    periods: getJson(KEYS.periods, [])
  };
}

export function getPeriods() {
  const periods = getJson(KEYS.periods, []);
  return Array.isArray(periods) ? periods.filter(Boolean).map(normalizePeriod) : [];
}

export function getSnapshots() {
  const snaps = getJson(KEYS.snapshots, []);
  return Array.isArray(snaps) ? snaps.filter(Boolean) : [];
}

export function deleteSnapshot(id) {
  setJson(KEYS.snapshots, getSnapshots().filter((s) => s.id !== id));
}

export function savePeriods(periods, baseline) {
  const before = getPeriods().length;
  batch(({ set, setJson: sj }) => {
    sj(KEYS.periods, periods);
    if (baseline !== undefined) {
      sj(KEYS.baseline, baseline);
      // Startwert für V1 mitführen, damit beide Versionen dasselbe anzeigen
      if (baseline && baseline.meterReading !== null && baseline.meterReading !== undefined) {
        set(KEYS.startMeter, String(baseline.meterReading));
        set(KEYS.startMeterAt, new Date().toISOString());
      }
    }
  });
  const what = periods.length > before ? 'close' : periods.length < before ? 'delete' : 'edit';
  emitChange('billing', { what, label: what === 'close' && periods[0] ? periods[0].label : undefined, ...billingSnapshot() });
}

// ---------- Darstellung ----------

export function getThemePreference() {
  const raw = getRaw(KEYS.darkMode);
  if (raw === 'true') return 'dark';
  if (raw === 'false') return 'light';
  return 'system';
}

export function setThemePreference(pref) {
  setRaw(KEYS.darkMode, pref === 'system' ? null : JSON.stringify(pref === 'dark'));
}

// ---------- Alles ----------

export function allKeys() {
  return [...Object.values(KEYS), ...LEGACY_KEYS];
}

// Gelesen wird der Willkommens-Status getrennt, damit "Alle Daten löschen" ihn nicht zurücksetzt
export function getWelcomeSeen() {
  return getRaw(KEYS.welcome);
}

export function setWelcomeSeen(version) {
  setRaw(KEYS.welcome, version);
}

export function getSeenVersion() {
  return getRaw(KEYS.seenVersion);
}

export function setSeenVersion(version) {
  setRaw(KEYS.seenVersion, version);
}

export function clearAll() {
  batch(({ set }) => {
    allKeys().forEach((key) => {
      if (key !== KEYS.welcome && key !== KEYS.seenVersion) set(key, null);
    });
  });
}

// ---------- Personen (Profile) ----------

export function getProfiles() {
  const profiles = getJson(KEYS.profiles, []);
  return Array.isArray(profiles) ? profiles.filter((p) => p && p.id && p.name).map((p) => ({ ...p, cards: Array.isArray(p.cards) ? p.cards : [] })) : [];
}

export function saveProfile(profile) {
  const profiles = getProfiles();
  // Eine Karte gehört immer nur zu einem Profil
  const cleaned = profiles.map((p) => (p.id === profile.id ? p : { ...p, cards: p.cards.filter((c) => !profile.cards.includes(c)) }));
  const exists = cleaned.some((p) => p.id === profile.id);
  setJson(KEYS.profiles, exists ? cleaned.map((p) => (p.id === profile.id ? profile : p)) : [...cleaned, profile]);
  emitChange('profile', { upsert: profile, isNew: !exists });
}

export function newProfileId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function deleteProfile(id) {
  const owners = getSessionOwners();
  const removed = getProfiles().find((p) => p.id === id);
  batch(({ setJson: sj, set }) => {
    sj(KEYS.profiles, getProfiles().filter((p) => p.id !== id));
    sj(KEYS.sessionOwners, Object.fromEntries(Object.entries(owners).filter(([, owner]) => owner !== id)));
    if (getRaw(KEYS.me) === id) set(KEYS.me, null);
  });
  if (removed) emitChange('profile', { remove: id, name: removed.name });
}

export function getSessionOwners() {
  const owners = getJson(KEYS.sessionOwners, {});
  return owners && typeof owners === 'object' && !Array.isArray(owners) ? owners : {};
}

// owner = Profil-ID, oder null = Zuordnung entfernen
export function setSessionOwners(sessionIds, owner) {
  const owners = { ...getSessionOwners() };
  sessionIds.forEach((id) => {
    if (owner) owners[id] = owner;
    else delete owners[id];
  });
  setJson(KEYS.sessionOwners, owners);
  emitChange('owners', { changes: Object.fromEntries(sessionIds.map((id) => [id, owner || null])) });
}

export function getUnassignedMode() {
  return getRaw(KEYS.unassignedMode) === 'split' ? 'split' : 'separate';
}

export function setUnassignedMode(mode) {
  setRaw(KEYS.unassignedMode, mode === 'split' ? 'split' : null);
  emitChange('settings', { what: 'unassigned', ...settingsSnapshot() });
}

export function getMe() {
  return getRaw(KEYS.me);
}

export function setMe(personKey) {
  setRaw(KEYS.me, personKey || null);
}

// ---------- Ladeverlauf (Zwischenspeicher) ----------

export function getCachedSessions() {
  const sessions = getJson(KEYS.sessions, []);
  return Array.isArray(sessions) ? sessions : [];
}

export function setCachedSessions(sessions, coveredFromMs) {
  batch(({ set, setJson: sj }) => {
    sj(KEYS.sessions, sessions);
    set(KEYS.sessionsAt, new Date().toISOString());
    if (typeof coveredFromMs === 'number') set(KEYS.sessionsFrom, new Date(coveredFromMs).toISOString());
  });
}

export function getSessionsCoveredFrom() {
  const raw = getRaw(KEYS.sessionsFrom);
  const ms = raw ? Date.parse(raw) : NaN;
  return isNaN(ms) ? null : ms;
}

export function getHistoryLink() {
  return getRaw(KEYS.historyLink) || getRaw('goe_export_url') || '';
}

export function setHistoryLink(link) {
  setRaw(KEYS.historyLink, link || null);
}

// ---------- Start von V2 ----------

const V1_KEYS = [KEYS.serial, KEYS.token, KEYS.price, KEYS.priceHistory, KEYS.currentMeter, KEYS.startMeter, KEYS.baseline, KEYS.periods, KEYS.snapshots];

export function hasV1Data() {
  return V1_KEYS.some((key) => getRaw(key) !== null);
}

// Kopie aller gespeicherten Werte – einmalig beim ersten Start von V2
export function createLocalBackup() {
  if (getRaw(KEYS.backupV1)) return;
  const values = {};
  [...Object.values(KEYS), ...LEGACY_KEYS].forEach((key) => {
    if (key === KEYS.backupV1) return;
    const value = getRaw(key);
    if (value !== null) values[key] = value;
  });
  setJson(KEYS.backupV1, { at: new Date().toISOString(), values });
}

export function getLocalBackup() {
  const backup = getJson(KEYS.backupV1, null);
  return backup && backup.values ? backup : null;
}

// Stand vor Version 2 wiederherstellen (überschreibt die gesicherten Schlüssel)
export function restoreLocalBackup() {
  const backup = getLocalBackup();
  if (!backup) return false;
  batch(({ set }) => {
    Object.entries(backup.values).forEach(([key, value]) => set(key, value));
  });
  return true;
}

// ---------- Gemeinsam nutzen ----------

export function getSync() {
  const sync = getJson(KEYS.sync, null);
  return sync && typeof sync.key === 'string' && typeof sync.device === 'string' ? { auto: true, notify: false, ...sync } : null;
}

export function setSync(sync) {
  setJson(KEYS.sync, sync);
}

export function updateSync(changes) {
  const sync = getSync();
  if (sync) setJson(KEYS.sync, { ...sync, ...changes });
}

// Ganz beenden: Schlüssel, offene und ungesendete Änderungen entfernen (eigene Daten bleiben)
export function clearSync() {
  batch(({ set }) => [KEYS.sync, KEYS.syncInbox, KEYS.syncOutbox, KEYS.syncStamps].forEach((key) => set(key, null)));
}

export function getSyncRemoved() {
  return getRaw(KEYS.syncRemoved);
}

export function setSyncRemoved(at) {
  setRaw(KEYS.syncRemoved, at);
}

export function getSyncInbox() {
  const list = getJson(KEYS.syncInbox, []);
  return Array.isArray(list) ? list : [];
}

export function setSyncInbox(list) {
  setJson(KEYS.syncInbox, list.length ? list : null);
}

export function getSyncOutbox() {
  const list = getJson(KEYS.syncOutbox, []);
  return Array.isArray(list) ? list : [];
}

export function setSyncOutbox(list) {
  setJson(KEYS.syncOutbox, list.length ? list : null);
}

// Für ganze Bereiche (Abrechnung, Preise, Einstellungen) gilt die neueste Änderung
const STAMPED = ['billing', 'prices', 'settings'];

function getStamps() {
  const stamps = getJson(KEYS.syncStamps, {});
  return stamps && typeof stamps === 'object' ? stamps : {};
}

function setStamp(type, at) {
  setJson(KEYS.syncStamps, { ...getStamps(), [type]: at });
}

// Nach einem übernommenen Gesamtstand: ältere Einzeländerungen danach nicht mehr übernehmen
export function markSynced(types, at) {
  setJson(KEYS.syncStamps, { ...getStamps(), ...Object.fromEntries(types.map((t) => [t, at])) });
}

/**
 * Änderung eines anderen Geräts einspielen. Gibt false zurück, wenn sie älter ist als der eigene Stand
 * (dann bleibt alles, wie es ist).
 */
export function applyRemote(change) {
  const { type, data, at } = change;
  if (STAMPED.includes(type)) {
    const mine = getStamps()[type];
    if (mine && Date.parse(at) < Date.parse(mine)) return false;
  }
  if (type === 'meter') {
    const localAt = getRaw(KEYS.currentMeterAt);
    if (localAt && data.currentAt && Date.parse(data.currentAt) < Date.parse(localAt)) return false;
  }
  applyingRemote = true;
  try {
    switch (type) {
      case 'meter':
        batch(({ set }) => {
          set(KEYS.currentMeter, data.current);
          set(KEYS.currentMeterAt, data.currentAt);
        });
        break;
      case 'billing':
        batch(({ set, setJson: sj }) => {
          sj(KEYS.baseline, data.baseline);
          set(KEYS.startMeter, data.startMeter);
          set(KEYS.startMeterAt, data.startMeterAt);
          set(KEYS.currentMeter, data.currentMeter);
          set(KEYS.currentMeterAt, data.currentMeterAt);
          sj(KEYS.periods, Array.isArray(data.periods) ? data.periods : []);
        });
        break;
      case 'prices':
        batch(({ set, setJson: sj }) => {
          set(KEYS.price, data.price);
          sj(KEYS.priceHistory, Array.isArray(data.history) ? data.history : []);
        });
        break;
      case 'settings':
        batch(({ set }) => {
          set(KEYS.unassignedMode, data.unassignedMode);
          set(KEYS.standardLoss, data.standardLoss);
        });
        break;
      case 'owners': {
        const owners = { ...getSessionOwners() };
        Object.entries(data.changes || {}).forEach(([id, owner]) => {
          if (owner) owners[id] = owner;
          else delete owners[id];
        });
        setJson(KEYS.sessionOwners, owners);
        break;
      }
      case 'profile':
        if (data.upsert) saveProfile(data.upsert);
        if (data.remove) deleteProfile(data.remove);
        break;
      default:
        return false;
    }
  } finally {
    applyingRemote = false;
  }
  if (STAMPED.includes(type)) setStamp(type, at);
  return true;
}
