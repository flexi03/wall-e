// Personen und Zuordnung von Ladevorgängen; Abrechnung auf Basis der Ladevorgänge.
//
// Person = angelegtes Profil (mit einer oder mehreren Karten) oder – solange eine Karte
// keinem Profil gehört – die Karte selbst. Ladevorgänge ohne Karte und ohne Zuordnung
// sind "nicht zugeordnet".
import { STANDARD_LOSS, UNASSIGNED_LABEL } from './billing.js';

export const UNASSIGNED = 'none';

const round2 = (n) => Math.round(n * 100) / 100;

export function cardNamesFrom(statusCards, sessions) {
  const names = [];
  (statusCards || []).forEach((c) => {
    if (c && c.name && c.name !== 'n/a' && !names.includes(c.name)) names.push(c.name);
  });
  (sessions || []).forEach((s) => {
    if (s.card && !names.includes(s.card)) names.push(s.card);
  });
  return names;
}

export function buildPersons(profiles, cardNames) {
  const owned = new Set(profiles.flatMap((p) => p.cards));
  const persons = [
    ...profiles.map((p) => ({ key: p.id, name: p.name, cards: p.cards, isProfile: true, chargeKw: p.chargeKw > 0 ? p.chargeKw : null, createdAt: p.createdAt || null })),
    ...cardNames.filter((c) => !owned.has(c)).map((c) => ({ key: `card:${c}`, name: c, cards: [c], isProfile: false }))
  ];
  return persons.map((p, index) => ({ ...p, colorIndex: index }));
}

export function personForCard(persons, cardName) {
  if (!cardName) return null;
  return persons.find((p) => p.cards.includes(cardName)) || null;
}

// Wem gehört ein Ladevorgang? Manuelle Zuordnung > Karte > niemand
export function ownerOf(session, persons, owners) {
  const manual = owners[session.id];
  if (manual && persons.some((p) => p.key === manual)) return manual;
  // Zuordnung zu einer Karte, die inzwischen zu einem Profil gehört → dieses Profil
  if (manual && manual.startsWith('card:')) {
    const viaCard = personForCard(persons, manual.slice(5));
    if (viaCard) return viaCard.key;
  }
  const person = personForCard(persons, session.card);
  return person ? person.key : UNASSIGNED;
}

// Beginn der laufenden Abrechnung (ms) – null = es gibt noch keinen Startpunkt.
// Der Beginn gehört immer zum Startwert des Hauszählers: Stammt der Startwert vom letzten Abschluss,
// beginnt die Abrechnung mit diesem Abschluss – auch wenn "before_meter_timestamp" später geändert wurde.
export function periodStart(baseline, periods, meters) {
  if (baseline && baseline.at) return Date.parse(baseline.at);
  const hasBaseline = baseline && typeof baseline.totalEnergyKwh === 'number' && baseline.meterReading !== null && baseline.meterReading !== undefined;
  if (!hasBaseline) return null;
  const last = periods[0];
  const parse = (d) => (d ? Date.parse(d) : NaN);
  const fromClose = last && (last.meterReading === baseline.meterReading || (last.baselineAfter && last.baselineAfter.meterReading === baseline.meterReading));
  if (fromClose && !isNaN(parse(last.createdAt))) return parse(last.createdAt);
  // Startwert von Hand gesetzt (V1: "Baseline speichern") → dessen Zeitpunkt, sonst der letzte Abschluss
  const candidates = [last && last.createdAt, meters.startAt].map(parse).filter((n) => !isNaN(n));
  return candidates.length ? Math.max(...candidates) : null;
}

// Ladeverlust messen: Hauszähler seit Start ÷ Wallbox im SELBEN Zeitraum (Start bis zur letzten Ablesung).
// Ladungen nach der Ablesung zählen hier nicht mit – sie bekommen denselben Faktor.
export const MAX_PLAUSIBLE_LOSS = 0.15; // mehr als 15 % (oder unter 0) → Zählerstand passt nicht, vorläufig rechnen und erinnern
export const MIN_MEASURE_KWH = 20; // zu wenig geladen für eine sinnvolle Messung

export function measureLoss({ sessions, from, meters }) {
  const meterKwh = typeof meters.start === 'number' && typeof meters.current === 'number' ? meters.current - meters.start : null;
  const readAt = meters.currentAt ? Date.parse(meters.currentAt) : NaN;
  const result = { meterKwh, readAt: isNaN(readAt) ? null : readAt, wallboxKwh: null, loss: null, reason: 'no-reading' };
  if (meterKwh === null || meterKwh <= 0 || (from !== null && result.readAt !== null && result.readAt <= from)) return result;
  const wallboxKwh = round2(sessionsInRange(sessions, from, result.readAt).reduce((sum, s) => sum + s.kwh, 0));
  result.wallboxKwh = wallboxKwh;
  if (wallboxKwh < MIN_MEASURE_KWH) return { ...result, reason: 'too-little' };
  const loss = meterKwh / wallboxKwh - 1;
  result.loss = loss;
  if (loss < 0 || loss > MAX_PLAUSIBLE_LOSS) return { ...result, reason: 'implausible' };
  return { ...result, reason: 'measured' };
}

// Ladevorgang gehört zur Abrechnung, in der er endet (laufende Ladungen fallen so nie heraus)
export function sessionsInRange(sessions, from, to) {
  return sessions.filter((s) => (from === null || s.end >= from) && (to === null || to === undefined || s.end < to));
}

function applyLoss({ people, unassignedKwh, measurement, standardLoss, price, unassignedMode }) {
  let rows = people;
  let unassigned = unassignedKwh > 0 ? unassignedKwh : 0;
  const assignedKwh = people.reduce((sum, p) => sum + p.kwh, 0);
  if (unassignedMode === 'split' && unassigned > 0 && assignedKwh > 0) {
    rows = people.map((p) => ({ ...p, kwh: p.kwh + unassigned * (p.kwh / assignedKwh), splitKwh: unassigned * (p.kwh / assignedKwh) }));
    unassigned = 0;
  }
  const wallboxKwh = rows.reduce((sum, p) => sum + p.kwh, 0) + unassigned;
  // Gemessener Ladeverlust, sonst vorläufig der pauschale Wert
  const isStandardLoss = measurement.reason !== 'measured';
  const factor = isStandardLoss ? 1 + standardLoss : 1 + measurement.loss;
  // paidKwh = was bezahlt werden muss (Anteil am tatsächlichen Verbrauch), lossKwh = Differenz zu den Ladevorgängen
  const withCost = rows.map((p) => ({ ...p, share: wallboxKwh > 0 ? p.kwh / wallboxKwh : 0, paidKwh: p.kwh * factor, lossKwh: p.kwh * (factor - 1), baseCost: p.kwh * price, cost: p.kwh * price * factor }));
  const baseCost = wallboxKwh * price;
  const untilReading = measurement.wallboxKwh;
  return {
    people: withCost,
    unassigned: unassigned > 0 ? { kwh: unassigned, share: unassigned / wallboxKwh, paidKwh: unassigned * factor, lossKwh: unassigned * (factor - 1), cost: unassigned * price * factor } : null,
    wallboxKwh,
    // Tatsächlicher Verbrauch = Hauszähler bis zur Ablesung + danach Geladenes mit demselben Faktor
    paidKwh: wallboxKwh * factor,
    lossKwh: wallboxKwh * (factor - 1),
    afterReadingKwh: !isStandardLoss && untilReading !== null ? Math.max(0, wallboxKwh - untilReading) : null,
    meterKwh: measurement.meterKwh,
    meterReadAt: measurement.readAt,
    wallboxKwhUntilReading: measurement.wallboxKwh,
    measuredLossPercent: measurement.loss !== null ? measurement.loss * 100 : null,
    lossReason: measurement.reason,
    factor,
    isStandardLoss,
    lossPercent: (factor - 1) * 100,
    baseCost,
    // Gesamt = Summe der Zeilen (Wallbox × Faktor). Liegen alle Ladungen vor der Ablesung, ist das genau der Hauszähler.
    totalCost: baseCost * factor,
    price
  };
}

/**
 * Laufende Abrechnung aus Ladevorgängen.
 * Rechenweg wie bei den Kartenständen (Ladeverlust aus dem Hauszähler, sonst pauschal 1,8 %),
 * nur dass der Verbrauch pro Person aus den einzelnen Ladevorgängen kommt.
 */
export function computeFromSessions({ sessions, persons, owners, from, meters, price, unassignedMode, standardLoss = STANDARD_LOSS }) {
  const included = sessionsInRange(sessions, from, null);
  const kwhBy = new Map(persons.map((p) => [p.key, 0]));
  let unassignedKwh = 0;
  const counts = new Map();
  included.forEach((s) => {
    const owner = ownerOf(s, persons, owners);
    counts.set(owner, (counts.get(owner) || 0) + 1);
    if (owner === UNASSIGNED) unassignedKwh += s.kwh;
    else kwhBy.set(owner, (kwhBy.get(owner) || 0) + s.kwh);
  });
  const people = persons
    .map((p) => ({ key: p.key, name: p.name, colorIndex: p.colorIndex, isProfile: p.isProfile, kwh: round2(kwhBy.get(p.key) || 0), sessions: counts.get(p.key) || 0 }))
    .filter((p) => p.kwh > 0 || p.isProfile);
  return {
    ...applyLoss({ people, unassignedKwh: round2(unassignedKwh), measurement: measureLoss({ sessions, from, meters }), standardLoss, price, unassignedMode }),
    source: 'sessions',
    from,
    sessionCount: included.length,
    unassignedCount: counts.get(UNASSIGNED) || 0
  };
}

// Kartenstände (V1-Rechnung) auf Personen zusammenfassen
export function groupCardsByPerson(cardResult, persons) {
  const byPerson = new Map();
  cardResult.people.forEach((row) => {
    const person = personForCard(persons, row.name);
    const key = person ? person.key : `card:${row.name}`;
    const entry = byPerson.get(key) || { key, name: person ? person.name : row.name, colorIndex: person ? person.colorIndex : persons.length, kwh: 0, baseCost: 0, cost: 0, share: 0 };
    entry.kwh += row.kwh;
    entry.paidKwh = (entry.paidKwh || 0) + row.paidKwh;
    entry.lossKwh = (entry.lossKwh || 0) + row.lossKwh;
    entry.baseCost += row.baseCost;
    entry.cost += row.cost;
    entry.share += row.share;
    byPerson.set(key, entry);
  });
  return { ...cardResult, people: [...byPerson.values()], unassigned: null, source: 'cards' };
}

// Zeilen für die Anzeige: Personen + ggf. "Nicht zugeordnet"
export function billingRows(current) {
  const rows = current.people.map((p) => ({ ...p }));
  if (current.unassigned) rows.push({ key: UNASSIGNED, name: UNASSIGNED_LABEL, kwh: current.unassigned.kwh, paidKwh: current.unassigned.paidKwh, lossKwh: current.unassigned.lossKwh, cost: current.unassigned.cost, share: current.unassigned.share, unassigned: true });
  return rows;
}
