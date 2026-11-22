import { describe, it, expect } from 'vitest';
import { buildPersons, cardNamesFrom, ownerOf, computeFromSessions, groupCardsByPerson, periodStart, sessionsInRange, measureLoss, UNASSIGNED } from '../people.js';
import { computeCurrentPeriod, closePeriod, splitBreakdown } from '../billing.js';
import { normalizeSession, mergeSessions, needsBackfill } from '../history.js';
import { cards } from './fixtures.js';

const H = 3600 * 1000;
const t0 = Date.parse('2026-10-01T00:00:00Z');
const sessions = [
  { id: 's1', start: t0 + 1 * H, end: t0 + 3 * H, kwh: 10, card: 'Alex' },
  { id: 's2', start: t0 + 24 * H, end: t0 + 30 * H, kwh: 20, card: 'Sam Fob' },
  { id: 's3', start: t0 + 48 * H, end: t0 + 50 * H, kwh: 5, card: null },
  { id: 's4', start: t0 - 48 * H, end: t0 - 40 * H, kwh: 99, card: 'Alex' } // vor dem Start
];

describe('Personen', () => {
  const names = cardNamesFrom(cards, sessions);
  it('Kartennamen aus Wallbox und Verlauf', () => {
    expect(names).toEqual(['Alex', 'Sam Fob']);
  });

  it('ohne Profile sind die Karten die Personen', () => {
    const persons = buildPersons([], names);
    expect(persons.map((p) => p.key)).toEqual(['card:Alex', 'card:Sam Fob']);
  });

  it('Profil mit mehreren Karten; manuelle Zuordnung gewinnt', () => {
    const persons = buildPersons([{ id: 'sam', name: 'Sam', cards: ['Sam Fob', 'Alex'] }], names);
    expect(persons).toHaveLength(1);
    expect(ownerOf(sessions[0], persons, {})).toBe('sam');
    expect(ownerOf(sessions[2], persons, {})).toBe(UNASSIGNED);
    expect(ownerOf(sessions[2], persons, { s3: 'sam' })).toBe('sam');
    expect(ownerOf(sessions[2], persons, { s3: 'geloescht' })).toBe(UNASSIGNED);
  });

  it('Zuordnung zu einer Karte folgt, wenn die Karte später in ein Profil kommt', () => {
    const persons = buildPersons([{ id: 'b', name: 'B', cards: ['Alex'] }], names);
    expect(ownerOf(sessions[2], persons, { s3: 'card:Alex' })).toBe('b');
  });
});

describe('Abrechnung aus Ladevorgängen', () => {
  const persons = buildPersons([], ['Alex', 'Sam Fob']);
  const meters = { start: 1000, current: 1035.56 }; // 35,56 kWh am Hauszähler, Wallbox 35 → 1,6 % Verlust

  it('eigene Zeile für Ladungen ohne Karte', () => {
    const r = computeFromSessions({ sessions, persons, owners: {}, from: t0, meters, price: 0.4, unassignedMode: 'separate' });
    expect(r.sessionCount).toBe(3);
    expect(r.people.map((p) => p.kwh)).toEqual([10, 20]);
    expect(r.unassigned.kwh).toBe(5);
    expect(r.wallboxKwh).toBe(35);
    expect(r.factor).toBeCloseTo(1.016, 6);
    expect(r.isStandardLoss).toBe(false);
    expect(r.totalCost).toBeCloseTo(35.56 * 0.4, 6);
    const sum = r.people.reduce((s, p) => s + p.cost, 0) + r.unassigned.cost;
    expect(sum).toBeCloseTo(r.totalCost, 6);
  });

  it('anteilig verteilen', () => {
    const r = computeFromSessions({ sessions, persons, owners: {}, from: t0, meters, price: 0.4, unassignedMode: 'split' });
    expect(r.unassigned).toBeNull();
    expect(r.people[0].kwh).toBeCloseTo(10 + 5 / 3, 6);
    expect(r.people[1].kwh).toBeCloseTo(20 + 10 / 3, 6);
    expect(r.people.reduce((s, p) => s + p.cost, 0)).toBeCloseTo(35.56 * 0.4, 6);
  });

  it('zugeordnete Ladung zählt für die Person', () => {
    const r = computeFromSessions({ sessions, persons, owners: { s3: 'card:Alex' }, from: t0, meters, price: 0.4, unassignedMode: 'separate' });
    expect(r.unassigned).toBeNull();
    expect(r.people[0].kwh).toBe(15);
  });

  it('ohne Startpunkt: alle Ladevorgänge', () => {
    const r = computeFromSessions({ sessions, persons, owners: {}, from: null, meters: { start: null, current: null }, price: 0.4, unassignedMode: 'separate' });
    expect(r.wallboxKwh).toBe(134);
    expect(r.isStandardLoss).toBe(true);
  });

  it('Ladevorgang zählt in der Abrechnung, in der er endet', () => {
    const spanning = [{ id: 'x', start: t0 - H, end: t0 + H, kwh: 3, card: 'Alex' }];
    expect(sessionsInRange(spanning, t0, null)).toHaveLength(1);
    expect(sessionsInRange(spanning, null, t0)).toHaveLength(0);
  });

  it('Abschluss: Verteilung inkl. "Nicht zugeordnet", Zeitraum gespeichert', () => {
    const r = computeFromSessions({ sessions, persons, owners: {}, from: t0, meters, price: 0.4, unassignedMode: 'separate' });
    const now = new Date(t0 + 72 * H);
    const { entry, baseline } = closePeriod({ current: r, cardTotals: { totalKwh: 100, cards: { Alex: 40, 'Sam Fob': 60 } }, baseline: { totalEnergyKwh: 50, meterReading: 1000, at: new Date(t0).toISOString() }, meterReading: 1038.5, chargedKwh: 38.5, price: 0.4, existingCount: 0, now });
    expect(entry.source).toBe('sessions');
    expect(entry.from).toBe(new Date(t0).toISOString());
    expect(entry.userBreakdown.map((u) => u.name)).toEqual(['Alex', 'Sam Fob', 'Nicht zugeordnet']);
    expect(entry.userBreakdown.reduce((s, u) => s + u.cost, 0)).toBeCloseTo(38.5 * 0.4, 6);
    expect(baseline.at).toBe(now.toISOString());
    expect(baseline.cards).toEqual({ Alex: 40, 'Sam Fob': 60 });
  });

  it('Abschluss ohne Wallbox-Status behält die alten Kartenstände', () => {
    const r = computeFromSessions({ sessions, persons, owners: {}, from: t0, meters, price: 0.4, unassignedMode: 'separate' });
    const { baseline } = closePeriod({ current: r, baseline: { totalEnergyKwh: 50, meterReading: 1000, cards: { Alex: 1 } }, meterReading: 1038.5, chargedKwh: 38.5, price: 0.4, existingCount: 0 });
    expect(baseline.totalEnergyKwh).toBe(50);
    expect(baseline.cards).toEqual({ Alex: 1 });
  });
});

describe('Rückfall auf Kartenstände', () => {
  it('Karten werden zu Profilen zusammengefasst', () => {
    const persons = buildPersons([{ id: 'sam', name: 'Sam', cards: ['Alex', 'Sam Fob'] }], ['Alex', 'Sam Fob']);
    const cardResult = computeCurrentPeriod({ cards, baseline: { totalEnergyKwh: null, meterReading: null }, meters: { start: null, current: null }, price: 0.3 });
    const grouped = groupCardsByPerson(cardResult, persons);
    expect(grouped.people).toHaveLength(1);
    expect(grouped.people[0].kwh).toBeCloseTo(cardResult.wallboxKwh, 6);
    expect(splitBreakdown(grouped, 100, 0.3)[0].share).toBeCloseTo(1, 6);
  });
});

describe('Startpunkt der laufenden Abrechnung', () => {
  it('aus der Basislinie, sonst späteres Datum von Abschluss und Startwert', () => {
    expect(periodStart({ totalEnergyKwh: 1, meterReading: 1, at: '2026-10-01T00:00:00Z' }, [], {})).toBe(t0);
    expect(periodStart({ totalEnergyKwh: 1, meterReading: 1 }, [{ createdAt: '2026-09-01T00:00:00Z' }], { startAt: '2026-10-01T00:00:00Z' })).toBe(t0);
    expect(periodStart({ totalEnergyKwh: null, meterReading: null }, [], {})).toBeNull();
  });

  it('Startwert vom letzten Abschluss → Beginn ist der Abschluss, auch wenn der Startwert-Zeitpunkt später ist', () => {
    const close = { createdAt: '2026-01-04T18:45:00Z', meterReading: 2913.13, baselineAfter: { totalEnergyKwh: 2864.1, meterReading: 2913.13 } };
    const start = periodStart({ totalEnergyKwh: 2864.1, meterReading: 2913.13 }, [close], { startAt: '2026-04-14T17:10:00Z' });
    expect(start).toBe(Date.parse('2026-01-04T18:45:00Z'));
  });
});

describe('Ladeverlust messen (gleicher Zeitraum wie der Hauszähler)', () => {
  const persons = buildPersons([], ['Alex', 'Sam']);
  const D = 24 * H;
  const readAt = t0 + 30 * D;
  // 100 kWh bis zur Ablesung, danach noch 50 kWh
  const list = [
    { id: 'a', start: t0 + 2 * D, end: t0 + 2 * D + 3 * H, kwh: 60, card: 'Alex' },
    { id: 'b', start: t0 + 9 * D, end: t0 + 9 * D + 3 * H, kwh: 40, card: 'Sam' },
    { id: 'c', start: t0 + 35 * D, end: t0 + 35 * D + 3 * H, kwh: 50, card: 'Sam' }
  ];
  const run = (meters, standardLoss = 0.016) => computeFromSessions({ sessions: list, persons, owners: {}, from: t0, meters, price: 0.3, unassignedMode: 'separate', standardLoss });

  it('nur Ladungen bis zur Ablesung zählen für die Messung, der Faktor gilt für alle', () => {
    const r = run({ start: 1000, current: 1101.7, currentAt: new Date(readAt).toISOString() });
    expect(r.wallboxKwhUntilReading).toBe(100);
    expect(r.lossReason).toBe('measured');
    expect(r.lossPercent).toBeCloseTo(1.7, 6);
    expect(r.wallboxKwh).toBe(150);
    const sum = r.people.reduce((s, p) => s + p.cost, 0);
    expect(sum).toBeCloseTo(150 * 1.017 * 0.3, 6);
    expect(r.totalCost).toBeCloseTo(sum, 6);
    // zu bezahlen = Hauszähler bis zur Ablesung + danach Geladenes × Faktor
    expect(r.afterReadingKwh).toBe(50);
    expect(r.paidKwh).toBeCloseTo(101.7 + 50 * 1.017, 6);
    expect(r.lossKwh).toBeCloseTo(r.paidKwh - 150, 6);
    const sam = r.people.find((p) => p.name === 'Sam');
    expect(sam.paidKwh).toBeCloseTo(r.paidKwh * sam.share, 6);
    expect(sam.lossKwh).toBeCloseTo(sam.paidKwh - 90, 6);
    expect(r.people.reduce((s, p) => s + p.paidKwh, 0)).toBeCloseTo(r.paidKwh, 6);
  });

  it('hoher, aber noch plausibler Verlust (bis 15 %) wird gemessen', () => {
    const r = run({ start: 1000, current: 1110, currentAt: new Date(readAt).toISOString() });
    expect(r.lossReason).toBe('measured');
    expect(r.lossPercent).toBeCloseTo(10, 6);
  });

  it('unplausibler Verlust über 15 % (Zähler veraltet oder Start falsch) → vorläufig mit Pauschalwert', () => {
    const r = run({ start: 1000, current: 1116, currentAt: new Date(readAt).toISOString() });
    expect(r.lossReason).toBe('implausible');
    expect(r.measuredLossPercent).toBeCloseTo(16, 6);
    expect(r.paidKwh).toBeCloseTo(150 * 1.016, 6);
    expect(r.isStandardLoss).toBe(true);
    expect(r.lossPercent).toBeCloseTo(1.6, 6);
    expect(r.totalCost).toBeCloseTo(150 * 1.016 * 0.3, 6);
  });

  it('Wallbox mehr als Hauszähler → vorläufig', () => {
    expect(run({ start: 1000, current: 1090, currentAt: new Date(readAt).toISOString() }).lossReason).toBe('implausible');
  });

  it('nach dem Abschluss noch nicht abgelesen → vorläufig', () => {
    const r = run({ start: 1000, current: 1000, currentAt: new Date(t0).toISOString() });
    expect(r.lossReason).toBe('no-reading');
    expect(r.lossPercent).toBeCloseTo(1.6, 6);
  });

  it('zu wenig geladen bis zur Ablesung → vorläufig', () => {
    expect(measureLoss({ sessions: list, from: t0, meters: { start: 1000, current: 1001, currentAt: new Date(t0 + D).toISOString() } }).reason).toBe('too-little');
  });

  it('Pauschalwert wie V1, wenn nichts eingestellt ist', () => {
    const r = computeFromSessions({ sessions: list, persons, owners: {}, from: t0, meters: { start: null, current: null }, price: 0.3, unassignedMode: 'separate' });
    expect(r.lossPercent).toBeCloseTo(1.8, 6);
  });
});

describe('Ladeverlauf ab Beginn der Abrechnung', () => {
  const D = 24 * H;
  const cached = [{ id: 'x', start: t0 + 100 * D, end: t0 + 100 * D + H, kwh: 1 }];
  it('fehlen ältere Ladevorgänge, wird nachgeladen – aber nur einmal', () => {
    expect(needsBackfill(cached, t0, null)).toBe(true);
    expect(needsBackfill(cached, t0, t0 - 7 * D)).toBe(false);
    expect(needsBackfill(cached, t0 + 200 * D, null)).toBe(false);
    expect(needsBackfill(cached, null, null)).toBe(false);
  });
});

describe('go-e Ladeverlauf', () => {
  const row = { session_number: 200, session_identifier: '123456_1791660250', id_chip: 2, id_chip_name: 'Sam Fob', startUnix: 1791660250000, endUnix: 1791749393000, seconds_charged: '08:46:25', max_power: 3.546, energy: 30.179 };

  it('Zeile normalisieren (mit und ohne Karte)', () => {
    expect(normalizeSession(row)).toMatchObject({ id: '123456_1791660250', kwh: 30.179, card: 'Sam Fob', chargedSeconds: 8 * 3600 + 46 * 60 + 25 });
    expect(normalizeSession({ ...row, id_chip: '', id_chip_name: '' })).toMatchObject({ card: null, chip: null });
    expect(normalizeSession({ ...row, session_identifier: '' })).toBeNull();
  });

  it('zusammenführen ohne Doppelte, neueste zuerst', () => {
    const a = [{ id: '1', start: 1 }, { id: '2', start: 2 }];
    const b = [{ id: '2', start: 2, kwh: 9 }, { id: '3', start: 3 }];
    const merged = mergeSessions(a, b);
    expect(merged.map((s) => s.id)).toEqual(['3', '2', '1']);
    expect(merged[1].kwh).toBe(9);
  });
});

import { sessionStats, personPowers, suggestOwner, suggestAll } from '../suggest.js';

describe('Vorschläge nach Ladeleistung', () => {
  const persons = buildPersons(
    [
      { id: 'a', name: 'A', cards: ['Karte A'], chargeKw: 3.7 },
      { id: 'b', name: 'B', cards: ['Karte B'] }
    ],
    ['Karte A', 'Karte B']
  );
  const mk = (id, maxKw, card = null, kwh = 10) => ({ id, start: 0, end: 4 * H, kwh, card, maxKw, chargedSeconds: 3 * 3600 });
  const history = [mk('b1', 11, 'Karte B'), mk('b2', 10.8, 'Karte B'), mk('b3', 11.1, 'Karte B'), mk('x1', 3.6), mk('x2', 10.9), mk('x3', 7.2), mk('x4', null)];

  it('Kennzahlen', () => {
    // 4 h angesteckt, 3 h geladen → 1 h Standzeit, Ø nur über die Ladezeit
    expect(sessionStats(mk('s', 3.7, null, 9))).toEqual({ connectedHours: 4, chargingHours: 3, idleHours: 1, chargingShare: 0.75, avgKw: 3, peakKw: 3.7 });
    expect(sessionStats({ ...mk('s', 3.7, null, 9), chargedSeconds: null }).avgKw).toBeNull();
  });

  it('Leistung aus Profil oder gelernt (Median, ab 3 Ladevorgängen)', () => {
    const powers = personPowers(persons, history, {});
    expect(powers.get('a')).toMatchObject({ kw: 3.7, learned: false });
    expect(powers.get('b')).toMatchObject({ kw: 11, learned: true, samples: 3 });
  });

  it('eindeutige Vorschläge, unklare und ohne Leistung keine', () => {
    const { suggestions } = suggestAll(history, persons, {});
    expect(suggestions.get('x1').key).toBe('a');
    expect(suggestions.get('x2').key).toBe('b');
    expect(suggestions.has('x3')).toBe(false); // 7,2 kW passt zu niemandem
    expect(suggestions.has('x4')).toBe(false);
    expect(suggestions.has('b1')).toBe(false); // schon zugeordnet
  });

  it('zwei Personen mit gleicher Leistung → kein Vorschlag', () => {
    const powers = new Map([['a', { kw: 11 }], ['b', { kw: 11 }]]);
    expect(suggestOwner(mk('s', 11), powers)).toBeNull();
  });

  it('neue Karte mit gleicher Leistung zählt erst ab ihrem ersten Ladevorgang', () => {
    const D = 24 * H;
    const t = (days) => days * D;
    const at = (id, day, maxKw, card = null) => ({ ...mk(id, maxKw, card), start: t(day), end: t(day) + 4 * H });
    const people = buildPersons(
      [
        { id: 'b', name: 'B', cards: ['Karte B'], chargeKw: 11, createdAt: new Date(t(50)).toISOString() }, // Profil später angelegt, Karte schon lange da
        { id: 'c', name: 'C', cards: ['Karte C'], chargeKw: 11, createdAt: new Date(t(100)).toISOString() }
      ],
      ['Karte B', 'Karte C']
    );
    const list = [at('b1', 1, 11, 'Karte B'), at('old', 40, 10.9), at('c1', 100, 11, 'Karte C'), at('new', 101, 11)];
    const { suggestions, powers } = suggestAll(list, people, {});
    expect(powers.get('b').since).toBe(t(1));
    expect(powers.get('c').since).toBe(t(100));
    expect(suggestions.get('old').key).toBe('b'); // C gab es damals noch nicht
    expect(suggestions.has('new')).toBe(false); // danach passen B und C → unklar
  });

  it('Profil ohne Ladevorgänge zählt ab dem Anlegen', () => {
    const people = buildPersons([{ id: 'n', name: 'N', cards: ['Neu'], chargeKw: 11, createdAt: new Date(10 * H).toISOString() }], ['Neu']);
    const powers = personPowers(people, [], {});
    expect(powers.get('n').since).toBe(10 * H);
    expect(suggestOwner({ ...mk('s', 11), start: 0 }, powers)).toBeNull();
    expect(suggestOwner({ ...mk('s', 11), start: 11 * H }, powers).key).toBe('n');
  });
});

import { timelineBuckets, timelineUnit, timelineTicks, bucketLabel } from '../timeline.js';

describe('Zeitleiste der laufenden Abrechnung', () => {
  const D = 24 * H;
  const persons = buildPersons([], ['Alex', 'Sam']);
  const from = new Date(2026, 0, 4, 19).getTime(); // Sonntagabend
  const at = (id, day, kwh, card) => ({ id, start: from + day * D, end: from + day * D + 3 * H, kwh, card });
  const list = [at('a', 1, 10, 'Alex'), at('b', 2, 20, 'Sam'), at('c', 9, 5, null), at('d', 40, 7, 'Alex'), { id: 'alt', start: from - 5 * D, end: from - 4 * D, kwh: 99, card: 'Alex' }];

  it('Einheit nach Länge des Zeitraums', () => {
    expect(timelineUnit(20 * D)).toBe('day');
    expect(timelineUnit(200 * D)).toBe('week');
    expect(timelineUnit(500 * D)).toBe('month');
  });

  it('Wochen ab Montag, gestapelt nach Person; Summe = Ladevorgänge der Abrechnung', () => {
    const { unit, buckets } = timelineBuckets({ sessions: list, persons, owners: {}, from, now: from + 45 * D });
    expect(unit).toBe('week');
    expect(new Date(buckets[0].start).getDay()).toBe(1);
    expect(buckets[0].shownStart).toBe(from);
    expect(buckets.reduce((s, b) => s + b.kwh, 0)).toBe(42); // ohne den Ladevorgang vor dem Beginn
    const second = buckets[1];
    expect(second.parts.map((p) => p.key)).toEqual(['card:Alex', 'card:Sam']);
    expect(buckets[2].parts).toEqual([{ key: 'none', kwh: 5, count: 1 }]);
  });

  it('Beschriftungen', () => {
    const { unit, buckets } = timelineBuckets({ sessions: list, persons, owners: {}, from, now: from + 45 * D });
    expect(timelineTicks(buckets, unit)[0]).toMatchObject({ index: 0, label: 'Jan' });
    expect(bucketLabel(buckets[1], unit)).toBe('5.–11. Jan. 2026');
  });

  it('ohne Ladevorgänge leer', () => {
    expect(timelineBuckets({ sessions: [], persons, owners: {}, from }).buckets).toEqual([]);
  });
});
