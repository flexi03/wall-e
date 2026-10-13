// Zentrale Datenschicht für alles, was Wall-E im Browser speichert (localStorage).
//
// Wichtig: V2 benutzt bewusst dieselben Schlüssel und Formate wie V1. So bleiben
// vorhandene Daten ohne Migration erhalten, und ein Zurückrollen auf V1 ist jederzeit
// möglich. Neue Werte bekommen neue Schlüssel mit Präfix "wall_e_".
// Übersicht aller Schlüssel: docs/DATA.md

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
  historyLink: 'wall_e_history_link', // Export-Link, falls die Wallbox keinen liefert
  welcome: 'wall_e_welcome', // zuletzt gezeigter Willkommens-Bildschirm (Version)
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
  return entry;
}

export function updatePrice(id, changes) {
  setJson(KEYS.priceHistory, getPriceHistory().map((p) => (p.id === id ? { ...p, ...changes } : p)));
}

export function deletePrice(id) {
  setJson(KEYS.priceHistory, getPriceHistory().filter((p) => p.id !== id));
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

export function setCurrentMeter(value) {
  batch(({ set }) => {
    set(KEYS.currentMeter, value === null ? null : String(value));
    set(KEYS.currentMeterAt, value === null ? null : new Date().toISOString());
  });
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
}

// Nur die Zahl des Startwerts korrigieren, Kartenstände der Basislinie bleiben
export function correctStartMeter(value) {
  const baseline = getBaseline();
  batch(({ set, setJson: sj }) => {
    set(KEYS.startMeter, String(value));
    set(KEYS.startMeterAt, new Date().toISOString());
    sj(KEYS.baseline, { ...baseline, meterReading: value });
  });
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

export function clearAll() {
  batch(({ set }) => {
    allKeys().forEach((key) => {
      if (key !== KEYS.welcome) set(key, null);
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
}

export function newProfileId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function deleteProfile(id) {
  const owners = getSessionOwners();
  batch(({ setJson: sj, set }) => {
    sj(KEYS.profiles, getProfiles().filter((p) => p.id !== id));
    sj(KEYS.sessionOwners, Object.fromEntries(Object.entries(owners).filter(([, owner]) => owner !== id)));
    if (getRaw(KEYS.me) === id) set(KEYS.me, null);
  });
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
}

export function getUnassignedMode() {
  return getRaw(KEYS.unassignedMode) === 'split' ? 'split' : 'separate';
}

export function setUnassignedMode(mode) {
  setRaw(KEYS.unassignedMode, mode === 'split' ? 'split' : null);
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

export function setCachedSessions(sessions) {
  batch(({ set, setJson: sj }) => {
    sj(KEYS.sessions, sessions);
    set(KEYS.sessionsAt, new Date().toISOString());
  });
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
