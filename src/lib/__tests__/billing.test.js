import { describe, it, expect } from 'vitest';
import { computeCurrentPeriod, closePeriod, editPeriod, deletePeriod, suggestChargedKwh, wallboxTotals } from '../billing.js';
import { cards, v1Compute } from './fixtures.js';

const baseline = { totalEnergyKwh: 1900.5, meterReading: 4800 };

function expectSameAsV1({ baseline: b, start, current, price }) {
  const v2 = computeCurrentPeriod({ cards, baseline: b, meters: { start, current }, price });
  const v1 = v1Compute({ cards, baseline: b, meterReading: current === null ? '' : String(current), beforeMeterReading: start === null ? '' : String(start), kwhPrice: String(price) });
  expect(v2.wallboxKwh).toBeCloseTo(v1.totalEnergyKwh, 6);
  expect(v2.isStandardLoss).toBe(v1.isNegativeLoss);
  expect(v2.totalCost).toBeCloseTo(v1.totalMeterCost ?? v2.totalCost, 6);
  v1.users.forEach((u) => {
    const person = v2.people.find((p) => p.name === u.name);
    expect(person.kwh).toBeCloseTo(u.kwh, 6);
    expect(person.cost).toBeCloseTo(u.cost, 6);
  });
  return v2;
}

describe('laufende Abrechnung = V1', () => {
  it('mit Basislinie und Zählerständen (echter Ladeverlust)', () => {
    const r = expectSameAsV1({ baseline, start: 4800, current: 5321.4, price: 0.35 });
    expect(r.wallboxKwh).toBeCloseTo(446.42, 2);
    expect(r.isStandardLoss).toBe(false);
    expect(r.lossPercent).toBeGreaterThan(0);
  });

  it('Zähler unplausibel → 1,8 % Standard-Ladeverlust', () => {
    const r = expectSameAsV1({ baseline, start: 4800, current: 4900, price: 0.35 });
    expect(r.isStandardLoss).toBe(true);
    expect(r.lossPercent).toBeCloseTo(1.8, 6);
  });

  it('ohne Basislinie: Gesamtstand der Karten', () => {
    const r = expectSameAsV1({ baseline: { totalEnergyKwh: null, meterReading: null }, start: null, current: null, price: 0.39 });
    expect(r.wallboxKwh).toBeCloseTo(812.35 + 1534.57, 2);
  });

  it('ohne Karten mit Energie', () => {
    const r = computeCurrentPeriod({ cards: [], baseline, meters: { start: 1, current: 2 }, price: 0.3 });
    expect(r.people).toEqual([]);
    expect(r.wallboxKwh).toBe(0);
  });
});

describe('Abrechnung abschließen', () => {
  const current = computeCurrentPeriod({ cards, baseline, meters: { start: 4800, current: 5321.4 }, price: 0.35 });

  it('Vorschlag = Hauszähler seit Start', () => {
    expect(suggestChargedKwh({ meterReading: 5321.4, baseline, current })).toBeCloseTo(521.4, 2);
  });

  it('erzeugt V1-kompatiblen Eintrag mit Verteilung nach V1-Anteilen', () => {
    const now = new Date('2026-10-13T10:00:00Z');
    const { entry, baseline: next } = closePeriod({ current, baseline, meterReading: 5321.4, chargedKwh: 521.4, price: 0.35, label: '', note: 'x', existingCount: 1, now });
    expect(entry.label).toBe('Zeitraum 2');
    expect(entry.totalCost).toBeCloseTo(521.4 * 0.35, 6);
    expect(entry.meterConsumption).toBeCloseTo(521.4, 6);
    const lifetimeShareAlex = 812.35 / (812.35 + 1534.57);
    expect(entry.userBreakdown[0].share).toBeCloseTo(lifetimeShareAlex, 3);
    expect(entry.userBreakdown.reduce((s, u) => s + u.energyKwh, 0)).toBeCloseTo(521.4, 6);
    // Neu: Startwerte pro Karte für die nächste Abrechnung
    expect(next.cards).toEqual({ Alex: 812.35, 'Sam Fob': 1534.57 });
    expect(next.meterReading).toBe(5321.4);
    expect(entry.baselineBefore).toEqual(baseline);
  });

  it('nach dem Abschluss: Verbrauch pro Karte statt Anteil', () => {
    const { baseline: next } = closePeriod({ current, baseline, meterReading: 5321.4, chargedKwh: 521.4, price: 0.35, existingCount: 1 });
    const later = [{ name: 'Alex', energy: 812345 + 20000 }, { name: 'Sam Fob', energy: 1534567 }];
    const r = computeCurrentPeriod({ cards: later, baseline: next, meters: { start: 5321.4, current: 5343 }, price: 0.35 });
    expect(r.perCard).toBe(true);
    expect(r.people.find((p) => p.name === 'Alex').kwh).toBeCloseTo(20, 2);
    expect(r.people.find((p) => p.name === 'Sam Fob').kwh).toBe(0);
  });
});

describe('bearbeiten und löschen', () => {
  const periods = [
    { id: 'b', chargedKwh: 100, pricePerKwh: 0.3, totalCost: 30, userBreakdown: [{ name: 'A', share: 0.25, energyKwh: 25, cost: 7.5 }, { name: 'B', share: 0.75, energyKwh: 75, cost: 22.5 }], baselineBefore: { totalEnergyKwh: 10, meterReading: 100 }, baselineAfter: { totalEnergyKwh: 20, meterReading: 200 } },
    { id: 'a', chargedKwh: 50, pricePerKwh: 0.3, totalCost: 15, userBreakdown: [], baselineBefore: { totalEnergyKwh: 0, meterReading: 50 }, baselineAfter: { totalEnergyKwh: 10, meterReading: 100 } }
  ];

  it('bearbeiten rechnet Kosten mit festen Anteilen neu (V1)', () => {
    const e = editPeriod(periods[0], { label: 'Neu', note: '', chargedKwh: 200, pricePerKwh: 0.4 });
    expect(e.totalCost).toBeCloseTo(80, 6);
    expect(e.userBreakdown[1].energyKwh).toBeCloseTo(150, 6);
    expect(e.userBreakdown[1].cost).toBeCloseTo(60, 6);
  });

  it('neueste löschen → Basislinie vom nächsten Eintrag (V1)', () => {
    const r = deletePeriod(periods, 'b');
    expect(r.baseline).toEqual(periods[1].baselineAfter);
  });

  it('letzte löschen → Stand vor dieser Abrechnung', () => {
    const r = deletePeriod([periods[1]], 'a');
    expect(r.periods).toEqual([]);
    expect(r.baseline).toEqual(periods[1].baselineBefore);
  });
});

it('wallboxTotals ignoriert unbenannte Karten', () => {
  expect(wallboxTotals(cards)).toEqual({ totalKwh: 812.35 + 1534.57, cards: { Alex: 812.35, 'Sam Fob': 1534.57 } });
});
