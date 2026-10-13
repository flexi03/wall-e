// Teilen und Sichern: Daten als Link, QR-Code oder Datei weitergeben.
// Alles passiert im Browser. Beim Link stehen die Daten hinter dem "#" – dieser Teil
// wird vom Browser nie an einen Server geschickt.

import { KEYS, getRaw, getJson, batch, getWallbox, getPriceHistory, getPeriods, getBaseline, getSnapshots, getProfiles, getSessionOwners, parseNumber } from './storage.js';

export const FORMAT = 'wall-e';
export const FORMAT_VERSION = 1;
const LINK_PREFIX = 'wall-e=1.';

export const SECTIONS = {
  wallbox: { label: 'Wallbox-Zugang', hint: 'Name, Seriennummer und API-Token' },
  prices: { label: 'Strompreise', hint: 'Aktiver Preis und Tarife' },
  billing: { label: 'Abrechnungen', hint: 'Zählerstände, laufende und abgeschlossene Abrechnungen' },
  people: { label: 'Personen', hint: 'Profile, Karten und zugeordnete Ladevorgänge' },
  settings: { label: 'Darstellung', hint: 'Hell/Dunkel' }
};

// Aktuelle Daten eines Bereichs auslesen (genau die V1-Formate)
function readSection(section) {
  switch (section) {
    case 'wallbox': {
      const w = getWallbox();
      if (!w.isConfigured) return null;
      return { serial: w.serial, token: w.token, name: w.name || null };
    }
    case 'prices': {
      const price = parseNumber(getRaw(KEYS.price));
      const history = getPriceHistory();
      if (!(price > 0) && history.length === 0) return null;
      return { active: price > 0 ? price : null, history };
    }
    case 'billing': {
      const periods = getPeriods();
      const baseline = getBaseline();
      const data = {
        baseline: getJson(KEYS.baseline, null) ? baseline : null,
        startMeter: getRaw(KEYS.startMeter),
        startMeterAt: getRaw(KEYS.startMeterAt),
        currentMeter: getRaw(KEYS.currentMeter),
        currentMeterAt: getRaw(KEYS.currentMeterAt),
        periods,
        snapshots: getSnapshots()
      };
      const empty = !data.baseline && !data.startMeter && !data.currentMeter && periods.length === 0 && data.snapshots.length === 0;
      return empty ? null : data;
    }
    case 'people': {
      const profiles = getProfiles();
      const owners = getSessionOwners();
      const mode = getRaw(KEYS.unassignedMode);
      if (profiles.length === 0 && Object.keys(owners).length === 0 && !mode) return null;
      return { profiles, owners, unassignedMode: mode };
    }
    case 'settings': {
      const darkMode = getRaw(KEYS.darkMode);
      return darkMode === null ? null : { darkMode };
    }
    default:
      return null;
  }
}

export function availableSections() {
  return Object.keys(SECTIONS).filter((s) => readSection(s) !== null);
}

export function buildPayload(sections) {
  const data = {};
  sections.forEach((s) => {
    const value = readSection(s);
    if (value !== null) data[s] = value;
  });
  return { format: FORMAT, version: FORMAT_VERSION, createdAt: new Date().toISOString(), data };
}

// Kurzbeschreibung für die Import-Vorschau
export function describePayload(payload) {
  const d = payload.data || {};
  const items = [];
  if (d.wallbox) items.push({ section: 'wallbox', text: d.wallbox.name ? `${d.wallbox.name} (${d.wallbox.serial})` : `Seriennummer ${d.wallbox.serial}` });
  if (d.prices) {
    const count = (d.prices.history || []).length;
    items.push({ section: 'prices', text: [d.prices.active ? `${String(d.prices.active).replace('.', ',')} €/kWh` : null, count ? `${count} Tarif${count === 1 ? '' : 'e'}` : null].filter(Boolean).join(' · ') });
  }
  if (d.billing) {
    const count = (d.billing.periods || []).length;
    items.push({ section: 'billing', text: `${count} abgeschlossene Abrechnung${count === 1 ? '' : 'en'}` });
  }
  if (d.people) {
    const count = (d.people.profiles || []).length;
    const assigned = Object.keys(d.people.owners || {}).length;
    items.push({ section: 'people', text: [`${count} Profil${count === 1 ? '' : 'e'}`, assigned ? `${assigned} zugeordnete Ladevorgänge` : null].filter(Boolean).join(' · ') });
  }
  if (d.settings) items.push({ section: 'settings', text: d.settings.darkMode === 'true' ? 'Dunkel' : 'Hell' });
  return items;
}

export function validatePayload(payload) {
  if (!payload || payload.format !== FORMAT || typeof payload.data !== 'object' || payload.data === null) {
    throw new Error('Das ist keine Wall-E-Datei bzw. kein Wall-E-Link.');
  }
  if (payload.version > FORMAT_VERSION) {
    throw new Error('Diese Daten stammen aus einer neueren Wall-E-Version. Bitte Wall-E aktualisieren.');
  }
  const { wallbox, prices, billing } = payload.data;
  if (wallbox && !(typeof wallbox.serial === 'string' && /^[A-Za-z0-9]{1,20}$/.test(wallbox.serial) && typeof wallbox.token === 'string')) {
    throw new Error('Der Wallbox-Zugang in den Daten ist ungültig.');
  }
  if (prices && prices.history && !Array.isArray(prices.history)) throw new Error('Die Strompreise in den Daten sind ungültig.');
  if (billing && billing.periods && !Array.isArray(billing.periods)) throw new Error('Die Abrechnungen in den Daten sind ungültig.');
  const { people } = payload.data;
  if (people && ((people.profiles && !Array.isArray(people.profiles)) || (people.owners && typeof people.owners !== 'object'))) {
    throw new Error('Die Personen in den Daten sind ungültig.');
  }
  return payload;
}

// Ausgewählte Bereiche übernehmen. Vorher wird der bisherige Stand gemerkt (Rückgängig).
export function applyPayload(payload, sections) {
  const d = payload.data;
  const undo = {};
  const remember = (key) => {
    undo[key] = getRaw(key);
  };

  batch(({ set, setJson }) => {
    if (sections.includes('wallbox') && d.wallbox) {
      [KEYS.serial, KEYS.token, KEYS.wallboxName, KEYS.demo].forEach(remember);
      set(KEYS.serial, d.wallbox.serial.trim());
      set(KEYS.token, d.wallbox.token.trim());
      set(KEYS.wallboxName, d.wallbox.name || null);
      set(KEYS.demo, null);
    }
    if (sections.includes('prices') && d.prices) {
      [KEYS.price, KEYS.priceHistory].forEach(remember);
      if (d.prices.active) set(KEYS.price, String(d.prices.active));
      setJson(KEYS.priceHistory, d.prices.history || []);
    }
    if (sections.includes('billing') && d.billing) {
      [KEYS.baseline, KEYS.startMeter, KEYS.startMeterAt, KEYS.currentMeter, KEYS.currentMeterAt, KEYS.periods, KEYS.snapshots].forEach(remember);
      setJson(KEYS.baseline, d.billing.baseline || null);
      set(KEYS.startMeter, d.billing.startMeter ?? null);
      set(KEYS.startMeterAt, d.billing.startMeterAt ?? null);
      set(KEYS.currentMeter, d.billing.currentMeter ?? null);
      set(KEYS.currentMeterAt, d.billing.currentMeterAt ?? null);
      setJson(KEYS.periods, d.billing.periods || []);
      setJson(KEYS.snapshots, d.billing.snapshots || []);
    }
    if (sections.includes('people') && d.people) {
      [KEYS.profiles, KEYS.sessionOwners, KEYS.unassignedMode].forEach(remember);
      setJson(KEYS.profiles, d.people.profiles || []);
      setJson(KEYS.sessionOwners, d.people.owners || {});
      set(KEYS.unassignedMode, d.people.unassignedMode || null);
    }
    if (sections.includes('settings') && d.settings) {
      remember(KEYS.darkMode);
      set(KEYS.darkMode, d.settings.darkMode ?? null);
    }
    setJson(KEYS.importUndo, { at: new Date().toISOString(), values: undo });
  });
}

export function getUndoInfo() {
  const undo = getJson(KEYS.importUndo, null);
  return undo && undo.values ? undo : null;
}

export function undoImport() {
  const undo = getUndoInfo();
  if (!undo) return false;
  batch(({ set }) => {
    Object.entries(undo.values).forEach(([key, value]) => set(key, value));
    set(KEYS.importUndo, null);
  });
  return true;
}

// ---------- Kodierung für Links ----------

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const response = new Response(new Response(bytes).body.pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encodePayload(payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (canCompress()) {
    return `z${bytesToBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
  }
  return `j${bytesToBase64Url(json)}`;
}

export async function decodePayload(code) {
  const kind = code[0];
  const bytes = base64UrlToBytes(code.slice(1));
  let json;
  if (kind === 'z') {
    if (!canCompress()) throw new Error('Dieser Browser kann den Link nicht öffnen. Bitte die Datei-Variante nutzen.');
    json = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind === 'j') {
    json = bytes;
  } else {
    throw new Error('Unbekanntes Format');
  }
  return validatePayload(JSON.parse(new TextDecoder().decode(json)));
}

export async function buildLink(payload, origin = window.location.origin) {
  return `${origin}/import#${LINK_PREFIX}${await encodePayload(payload)}`;
}

// Akzeptiert einen kompletten Link, nur den Teil hinter "#" oder den reinen Code
export function extractCode(text) {
  const trimmed = (text || '').trim();
  const index = trimmed.indexOf(LINK_PREFIX);
  if (index === -1) return null;
  return trimmed.slice(index + LINK_PREFIX.length).split(/\s/)[0];
}

export async function readLinkOrCode(text) {
  const code = extractCode(text);
  if (!code) throw new Error('Kein gültiger Wall-E-Link.');
  try {
    return await decodePayload(code);
  } catch (error) {
    if (error instanceof SyntaxError || error.name === 'InvalidCharacterError' || error.name === 'TypeError') {
      throw new Error('Der Link ist unvollständig oder beschädigt.');
    }
    throw error;
  }
}

// ---------- Datei ----------

export function payloadToFile(payload) {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  return new File([blob], `wall-e-${date}.json`, { type: 'application/json' });
}

// Datei teilen (Handy: Teilen-Menü, z. B. AirDrop/Dateien) oder herunterladen. true = gespeichert/geteilt
export async function saveFile(payload) {
  const file = payloadToFile(payload);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Wall-E Sicherung' });
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function readFile(file) {
  const text = await file.text();
  try {
    return validatePayload(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Die Datei ist keine gültige Wall-E-Sicherung.');
    throw error;
  }
}
