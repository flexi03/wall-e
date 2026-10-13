// Ladeverlauf (einzelne Ladevorgänge) aus dem go-e Export über server/api/history.php

// Rohzeile von go-e → kompakter Ladevorgang
export function normalizeSession(row) {
  const start = Number(row.startUnix);
  const end = Number(row.endUnix);
  const kwh = typeof row.energy === 'number' ? row.energy : parseFloat(row.energy);
  if (!row.session_identifier || !(start > 0) || !(kwh >= 0)) return null;
  const card = typeof row.id_chip_name === 'string' && row.id_chip_name.trim() ? row.id_chip_name.trim() : null;
  return {
    id: String(row.session_identifier),
    number: Number(row.session_number) || null,
    start,
    end: end > 0 ? end : start,
    kwh: Math.round(kwh * 1000) / 1000,
    card,
    chip: row.id_chip === '' || row.id_chip === null || row.id_chip === undefined ? null : Number(row.id_chip),
    maxKw: typeof row.max_power === 'number' ? row.max_power : null,
    chargedSeconds: parseDuration(row.seconds_charged)
  };
}

function parseDuration(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/^(\d+):(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

// Neue Ladevorgänge in den Bestand übernehmen (gleiche ID → neuere Daten gewinnen), neueste zuerst
export function mergeSessions(existing, incoming) {
  const byId = new Map(existing.map((s) => [s.id, s]));
  incoming.forEach((s) => byId.set(s.id, s));
  return [...byId.values()].sort((a, b) => b.start - a.start);
}

async function request(link, range) {
  const body = { link, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...range };
  let response;
  try {
    response = await fetch('/api/history.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('Keine Internetverbindung');
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // keine JSON-Antwort
  }
  if (!response.ok || !data || !Array.isArray(data.data)) {
    throw new Error((data && data.error) || `Verlauf nicht abrufbar (${response.status})`);
  }
  return data.data.map(normalizeSession).filter(Boolean);
}

const DAY = 24 * 60 * 60 * 1000;

// Bestand aktualisieren: beim ersten Mal alles, danach nur ab einer Woche vor dem neuesten Ladevorgang
export async function syncSessions(link, cached) {
  if (cached.length === 0) {
    let sessions = await request(link, {});
    // go-e liefert ohne Zeitraum evtl. nur einen Teil – sicherheitshalber ab dem neuesten nachladen
    if (sessions.length > 0) {
      const newest = Math.max(...sessions.map((s) => s.start));
      sessions = mergeSessions(sessions, await request(link, { from: newest - 7 * DAY, to: Date.now() + DAY }));
    }
    return mergeSessions([], sessions);
  }
  const newest = Math.max(...cached.map((s) => s.start));
  const recent = await request(link, { from: newest - 7 * DAY, to: Date.now() + DAY });
  return mergeSessions(cached, recent);
}

// Demo-Verlauf passend zu den Demo-Karten: "Alex" lädt einphasig (≈ 3,7 kW), "Sam" dreiphasig (≈ 11 kW)
export function demoSessions() {
  const now = Date.now();
  const POWER = { Alex: 3.7, Sam: 11 };
  // [Karte, kWh, Spitzenleistung bei Ladungen ohne Karte]
  const plan = [['Alex', 8], ['Sam', 15], ['Alex', 22], [null, 29, 10.9], ['Alex', 13], ['Sam', 20], ['Alex', 27], [null, 11, 3.6], ['Alex', 9], ['Alex', 16], ['Sam', 23], [null, 6, 7.2]];
  return plan.map(([card, kwh, peak], i) => {
    const maxKw = card ? POWER[card] - (i % 3) * 0.05 : peak;
    const chargedSeconds = Math.round((kwh / (maxKw * 0.95)) * 3600);
    const start = now - (i + 1) * 2.6 * DAY - 3 * 3600 * 1000;
    return { id: `demo_${i}`, number: 100 - i, start, end: start + chargedSeconds * 1000 + 1800 * 1000, kwh, card, chip: card ? 1 : null, maxKw, chargedSeconds };
  });
}
