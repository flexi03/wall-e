// Kompatibilität mit Wall-E 1: V2 muss V1-Daten unverändert lesen, beim Schreiben V1-lesbar bleiben
// und ein Zurück auf V1 jederzeit erlauben.
import { describe, it, expect, beforeEach } from 'vitest';
import * as store from '../storage.js';
import { computeCurrentPeriod, closePeriod, editPeriod, deletePeriod } from '../billing.js';
import { buildPayload, applyPayload, undoImport } from '../share.js';
import { cards, v1Storage, seed, v1Compute } from './fixtures.js';

const V1_KEYS = Object.keys(v1Storage);
const dump = () => Object.fromEntries(V1_KEYS.map((k) => [k, localStorage.getItem(k)]));

// So liest V1 (EnergyUsagePage) die gespeicherten Werte – inkl. der Zahlenformate als Text
function v1Read() {
  const baseline = JSON.parse(localStorage.getItem('billing_baseline') || 'null');
  return {
    baseline,
    meterReading: localStorage.getItem('energy_meter_reading') || '',
    beforeMeterReading: localStorage.getItem('before_meter_reading') || '',
    kwhPrice: localStorage.getItem('kwh_price') || '0.39',
    periods: JSON.parse(localStorage.getItem('billing_periods') || '[]'),
    history: JSON.parse(localStorage.getItem('kwh_price_history') || '[]')
  };
}

// V1 ruft auf diesen Feldern .toFixed() auf – sie müssen Zahlen sein, sonst stürzt V1 ab
function expectV1PeriodShape(p) {
  ['chargedKwh', 'pricePerKwh', 'totalCost'].forEach((f) => expect(typeof p[f]).toBe('number'));
  expect(typeof p.label).toBe('string');
  expect(typeof p.createdAt).toBe('string');
  expect(Array.isArray(p.userBreakdown)).toBe(true);
  p.userBreakdown.forEach((u) => {
    ['share', 'energyKwh', 'cost'].forEach((f) => expect(typeof u[f]).toBe('number'));
    expect(typeof u.name).toBe('string');
  });
}

beforeEach(() => seed());

describe('Lesen ändert nichts', () => {
  it('alle Getter lassen die V1-Werte unangetastet', () => {
    const before = dump();
    store.getWallbox();
    store.getPrice();
    store.getPriceHistory();
    store.getMeters();
    store.getBaseline();
    store.getPeriods();
    store.getSnapshots();
    store.getThemePreference();
    store.getProfiles();
    store.getSessionOwners();
    buildPayload(['wallbox', 'prices', 'billing', 'people', 'settings']);
    expect(dump()).toEqual(before);
  });
});

describe('Was V2 schreibt, kann V1 lesen', () => {
  it('Abrechnung abschließen: V1 rechnet danach dasselbe wie V2', () => {
    const meters = store.getMeters();
    const price = store.getPrice().value;
    const current = computeCurrentPeriod({ cards, baseline: store.getBaseline(), meters, price });
    const { entry, baseline } = closePeriod({ current, baseline: store.getBaseline(), meterReading: 5400, chargedKwh: 600, price, existingCount: store.getPeriods().length });
    store.savePeriods([entry, ...store.getPeriods()], baseline);
    store.setCurrentMeter(5450);

    const v1 = v1Read();
    expect(v1.periods).toHaveLength(2);
    v1.periods.forEach(expectV1PeriodShape);
    // V1 liest den Startwert aus before_meter_reading – V2 muss ihn beim Abschluss mitschreiben
    expect(v1.beforeMeterReading).toBe('5400');
    expect(v1.baseline).toMatchObject({ totalEnergyKwh: expect.any(Number), meterReading: 5400 });

    const later = [{ name: 'Alex', energy: 812345 + 30000 }, { name: 'Sam Fob', energy: 1534567 + 20000 }];
    const v1Result = v1Compute({ cards: later, ...v1 });
    const v2Result = computeCurrentPeriod({ cards: later, baseline: store.getBaseline(), meters: store.getMeters(), price });
    // Gesamtkosten und Hauszähler sind gleich; pro Person rechnet V2 seit dem Abschluss genauer (pro Karte)
    expect(v2Result.meterKwh).toBeCloseTo(v1Result.totalMeterConsumption, 6);
    expect(v2Result.wallboxKwh).toBeCloseTo(v1Result.totalEnergyKwh, 6);
    expect(v2Result.totalCost).toBeCloseTo(v1Result.totalMeterCost, 6);
  });

  it('Abrechnung bearbeiten und löschen bleiben im V1-Format', () => {
    const [period] = store.getPeriods();
    store.savePeriods([editPeriod(period, { label: 'Neu', note: 'x', chargedKwh: 500, pricePerKwh: 0.4 })]);
    v1Read().periods.forEach(expectV1PeriodShape);
    const result = deletePeriod(store.getPeriods(), period.id);
    store.savePeriods(result.periods, result.baseline);
    expect(v1Read().periods).toEqual([]);
    expect(v1Read().baseline).toMatchObject({ meterReading: 4387.7 });
  });

  it('Strompreis, Zähler, Startwert und Design im V1-Format', () => {
    store.addPrice('Neu', 0.42);
    store.setCurrentMeter(5555.5);
    store.correctStartMeter(4801);
    store.setThemePreference('light');
    const v1 = v1Read();
    expect(v1.kwhPrice).toBe('0.42');
    expect(v1.history[0]).toMatchObject({ label: 'Neu', price: 0.42 });
    expect(typeof v1.history[0].id).toBe('string');
    expect(v1.meterReading).toBe('5555.5');
    expect(v1.beforeMeterReading).toBe('4801');
    expect(v1.baseline.meterReading).toBe(4801);
    expect(JSON.parse(localStorage.getItem('darkMode'))).toBe(false);
    expect(localStorage.getItem('energy_meter_timestamp')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('Wallbox-Zugang bleibt in den V1-Schlüsseln', () => {
    store.saveWallbox({ serial: '654321', token: 'neuerToken', name: 'Garage' });
    expect(localStorage.getItem('goe_serial_number')).toBe('654321');
    expect(localStorage.getItem('goe_api_token')).toBe('neuerToken');
  });
});

describe('Neue V2-Funktionen fassen V1-Daten nicht an', () => {
  it('Profile, Zuordnungen, Ladeverlauf, "Das bin ich", Demo', () => {
    const before = dump();
    store.saveProfile({ id: 'p1', name: 'Alex', cards: ['Alex'], chargeKw: 3.7 });
    store.setSessionOwners(['s1', 's2'], 'p1');
    store.setUnassignedMode('split');
    store.setMe('p1');
    store.setCachedSessions([{ id: 's1', start: 1, end: 2, kwh: 3, card: null }]);
    store.setHistoryLink('https://data.v3.go-e.io/export?e=abcdefghijklmnopqrstuvwxyz');
    store.setDemoMode(true);
    store.setDemoMode(false);
    store.setWelcomeSeen('2');
    store.createLocalBackup();
    expect(dump()).toEqual(before);
  });

  it('Altlasten aus V1 bleiben liegen (nur "Alle Daten löschen" entfernt sie)', () => {
    store.addPrice('X', 0.3);
    store.clearWallbox();
    expect(localStorage.getItem('wallbox_sessions')).toBe('[]');
    expect(localStorage.getItem('goe_auth_cookies')).toBe('session=abc');
    store.clearAll();
    expect(localStorage.getItem('wallbox_sessions')).toBeNull();
  });
});

describe('Zurück zu V1', () => {
  it('Sicherung beim ersten Start stellt den V1-Stand byte-genau wieder her', () => {
    const before = dump();
    store.createLocalBackup();
    store.addPrice('X', 0.5);
    store.setCurrentMeter(9999);
    store.savePeriods([]);
    store.saveWallbox({ serial: '1', token: 't', name: '' });
    store.restoreLocalBackup();
    expect(dump()).toEqual(before);
  });

  it('Import und Rückgängig stellen exakt die vorherigen Werte her', () => {
    const before = dump();
    const payload = { format: 'wall-e', version: 1, createdAt: '2026-10-13T00:00:00Z', data: { wallbox: { serial: '999', token: 'x', name: null }, prices: { active: 0.5, history: [] }, billing: { baseline: null, periods: [], snapshots: [] } } };
    applyPayload(payload, ['wallbox', 'prices', 'billing']);
    expect(localStorage.getItem('goe_serial_number')).toBe('999');
    undoImport();
    expect(dump()).toEqual(before);
  });
});

describe('Varianten von V1-Daten', () => {
  it('nur Wallbox-Zugang, sonst nichts (frische V1-Installation)', () => {
    localStorage.clear();
    localStorage.setItem('goe_serial_number', '123');
    localStorage.setItem('goe_api_token', 'tok');
    expect(store.hasV1Data()).toBe(true);
    expect(store.getPrice()).toEqual({ value: 0.39, isSet: false });
    expect(store.getMeters()).toMatchObject({ start: null, current: null });
    expect(store.getPeriods()).toEqual([]);
    expect(store.getThemePreference()).toBe('system');
    const r = computeCurrentPeriod({ cards, baseline: store.getBaseline(), meters: store.getMeters(), price: 0.39 });
    const v1 = v1Compute({ cards, baseline: null, meterReading: '', beforeMeterReading: '', kwhPrice: '' });
    expect(r.wallboxKwh).toBeCloseTo(v1.totalEnergyKwh, 6);
    r.people.forEach((p, i) => expect(p.cost).toBeCloseTo(v1.users[i].cost, 6));
  });

  it('Abrechnung ohne baselineBefore/After (frühe V1-Version)', () => {
    localStorage.setItem('billing_periods', JSON.stringify([{ id: 'a', label: 'Alt', createdAt: '2025-01-01T00:00:00Z', chargedKwh: 10, pricePerKwh: 0.3, totalCost: 3 }]));
    const [p] = store.getPeriods();
    expect(p.userBreakdown).toEqual([]);
    expect(p.baselineAfter).toBeNull();
    const result = deletePeriod(store.getPeriods(), 'a');
    expect(result.periods).toEqual([]);
  });

  it('Werte mit Komma oder Leerzeichen, wie sie in V1-Feldern landen konnten', () => {
    localStorage.setItem('kwh_price', '0,35');
    localStorage.setItem('energy_meter_reading', ' 5321.4 ');
    expect(store.getPrice().value).toBe(0.35);
    expect(store.getMeters().current).toBe(5321.4);
  });

  it('kein localStorage verfügbar (privater Modus): nichts stürzt ab', () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} },
      configurable: true
    });
    try {
      expect(store.getWallbox().isConfigured).toBe(false);
      expect(store.getPeriods()).toEqual([]);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true, writable: true });
    }
  });
});
