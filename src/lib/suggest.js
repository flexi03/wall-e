// Kennzahlen eines Ladevorgangs und Zuordnungs-Vorschläge anhand der Ladeleistung.
//
// Idee: Jedes Auto lädt mit einer typischen Höchstleistung (einphasig ≈ 3,7 kW, dreiphasig ≈ 11 kW).
// Ein Profil kann diesen Wert angeben; ohne Angabe wird er aus den bereits zugeordneten
// Ladevorgängen gelernt (Median der Spitzenleistung). Ein Ladevorgang ohne Zuordnung bekommt
// einen Vorschlag, wenn genau eine Person eindeutig passt.

import { ownerOf, UNASSIGNED } from './people.js';

export const MATCH_TOLERANCE = 0.25; // höchstens 25 % Abweichung von der typischen Leistung
export const MIN_GAP = 0.15; // die zweitbeste Person muss deutlich schlechter passen
export const MIN_LEARN_SAMPLES = 3; // so viele Ladevorgänge braucht es zum Lernen

/**
 * Zeiten und Leistung eines Ladevorgangs.
 * - connectedHours: angesteckt (Start bis Ende)
 * - chargingHours: Strom floss wirklich (go-e "seconds_charged") – nur diese Zeit zählt für die Ø-Leistung
 * - idleHours: Standzeit = angesteckt, aber ohne Laden
 */
export function sessionStats(session) {
  const connectedHours = session.end > session.start ? (session.end - session.start) / 3600000 : null;
  const chargingHours = session.chargedSeconds > 0 ? session.chargedSeconds / 3600 : null;
  const idleHours = connectedHours !== null && chargingHours !== null ? Math.max(0, connectedHours - chargingHours) : null;
  const avgKw = chargingHours && session.kwh > 0 ? session.kwh / chargingHours : null;
  const peakKw = typeof session.maxKw === 'number' && session.maxKw > 0 ? session.maxKw : null;
  return {
    connectedHours,
    chargingHours,
    idleHours,
    chargingShare: connectedHours && chargingHours !== null ? Math.min(1, chargingHours / connectedHours) : null,
    avgKw,
    peakKw
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Typische Ladeleistung jeder Person.
 * @returns Map<personKey, { kw, learned, samples }>
 */
export function personPowers(persons, sessions, owners) {
  const peaks = new Map();
  sessions.forEach((s) => {
    const owner = ownerOf(s, persons, owners);
    const { peakKw } = sessionStats(s);
    if (owner === UNASSIGNED || !peakKw || s.kwh < 1) return; // Kurz-Ladungen verfälschen den Wert
    if (!peaks.has(owner)) peaks.set(owner, []);
    peaks.get(owner).push(peakKw);
  });
  const result = new Map();
  persons.forEach((p) => {
    const samples = peaks.get(p.key) || [];
    if (p.chargeKw > 0) result.set(p.key, { kw: p.chargeKw, learned: false, samples: samples.length });
    else if (samples.length >= MIN_LEARN_SAMPLES) result.set(p.key, { kw: median(samples), learned: true, samples: samples.length });
  });
  return result;
}

// Passende Person für einen Ladevorgang – oder null, wenn es nicht eindeutig ist
export function suggestOwner(session, powers) {
  const { peakKw } = sessionStats(session);
  if (!peakKw || powers.size === 0) return null;
  const ranked = [...powers.entries()]
    .map(([key, { kw }]) => ({ key, kw, diff: Math.abs(peakKw - kw) / kw }))
    .sort((a, b) => a.diff - b.diff);
  const [best, second] = ranked;
  if (best.diff > MATCH_TOLERANCE) return null;
  if (second && second.diff - best.diff < MIN_GAP) return null;
  return { key: best.key, kw: best.kw, diff: best.diff };
}

// Vorschläge für alle nicht zugeordneten Ladevorgänge: Map<sessionId, Vorschlag>
export function suggestAll(sessions, persons, owners) {
  const powers = personPowers(persons, sessions, owners);
  const suggestions = new Map();
  sessions.forEach((s) => {
    if (ownerOf(s, persons, owners) !== UNASSIGNED) return;
    const suggestion = suggestOwner(s, powers);
    if (suggestion) suggestions.set(s.id, suggestion);
  });
  return { suggestions, powers };
}
