import { describe, it, expect, beforeEach } from 'vitest';
import * as store from '../storage.js';
import { buildPayload, availableSections, encodePayload, decodePayload, buildLink, readLinkOrCode, applyPayload, undoImport, describePayload } from '../share.js';
import { seed, v1Storage } from './fixtures.js';

beforeEach(() => seed());

describe('V1-Daten werden ohne Migration gelesen', () => {
  it('Wallbox, Preis, Zähler, Abrechnungen, Darstellung', () => {
    expect(store.getWallbox()).toMatchObject({ serial: '123456', token: 'abcDEF123token', isConfigured: true });
    expect(store.getPrice()).toEqual({ value: 0.35, isSet: true });
    expect(store.getPriceHistory()).toHaveLength(2);
    expect(store.getMeters()).toMatchObject({ start: 4800, current: 5321.4 });
    expect(store.getPeriods()).toHaveLength(1);
    expect(store.getSnapshots()).toHaveLength(1);
    expect(store.getThemePreference()).toBe('dark');
  });

  it('Startwert kommt aus der Basislinie, wenn V1 ihn nicht fortgeschrieben hat', () => {
    localStorage.setItem('before_meter_reading', '4387.7');
    expect(store.getMeters().start).toBe(4800);
  });

  it('alte Basislinie im { users } Format', () => {
    localStorage.setItem('billing_baseline', JSON.stringify({ users: [{ rawEnergyKwh: 10 }, { rawEnergyKwh: 5 }], meterReading: 100 }));
    expect(store.getBaseline()).toEqual({ totalEnergyKwh: 15, meterReading: 100 });
  });

  it('kaputte JSON-Werte führen nicht zum Absturz', () => {
    localStorage.setItem('billing_periods', '{kaputt');
    localStorage.setItem('kwh_price_history', 'null');
    expect(store.getPeriods()).toEqual([]);
    expect(store.getPriceHistory()).toEqual([]);
  });

  it('Komma-Eingaben', () => {
    expect(store.parseNumber('0,39')).toBe(0.39);
    expect(store.parseNumber(' 5321,4 ')).toBe(5321.4);
    expect(store.parseNumber('abc')).toBeNaN();
    expect(store.parseNumber('')).toBeNaN();
  });

  it('System-Design wenn kein darkMode gespeichert', () => {
    store.setThemePreference('system');
    expect(localStorage.getItem('darkMode')).toBeNull();
    store.setThemePreference('light');
    expect(localStorage.getItem('darkMode')).toBe('false');
  });

  it('Schreiben bleibt im V1-Format', () => {
    store.addPrice('Neu', 0.31);
    expect(localStorage.getItem('kwh_price')).toBe('0.31');
    expect(JSON.parse(localStorage.getItem('kwh_price_history'))[0]).toMatchObject({ label: 'Neu', price: 0.31 });
    store.saveWallbox({ serial: ' 999 ', token: ' t ', name: 'Garage' });
    expect(localStorage.getItem('goe_serial_number')).toBe('999');
    expect(localStorage.getItem('wall_e_wallbox_name')).toBe('Garage');
  });
});

describe('Teilen & Sichern', () => {
  it('Link hin und zurück (komprimiert)', async () => {
    const payload = buildPayload(availableSections());
    const link = await buildLink(payload, 'https://wall-e.example.com');
    expect(link.startsWith('https://wall-e.example.com/import#wall-e=1.')).toBe(true);
    const decoded = await readLinkOrCode(link);
    expect(decoded.data).toEqual(payload.data);
  });

  it('Code ohne Kompression', async () => {
    const payload = buildPayload(['prices']);
    const json = 'j' + btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect((await decodePayload(json)).data).toEqual(payload.data);
    expect((await encodePayload(payload)).startsWith('z')).toBe(true);
  });

  it('ungültige Links werden sauber abgelehnt', async () => {
    await expect(readLinkOrCode('https://example.com')).rejects.toThrow('Kein gültiger');
    await expect(readLinkOrCode('#wall-e=1.zAAAA')).rejects.toThrow();
  });

  it('Import auf leerem Gerät und Rückgängig', () => {
    const payload = buildPayload(['wallbox', 'prices', 'billing', 'settings']);
    expect(describePayload(payload).map((i) => i.section)).toEqual(['wallbox', 'prices', 'billing', 'settings']);
    localStorage.clear();
    applyPayload(payload, ['wallbox', 'billing']);
    expect(store.getWallbox().serial).toBe('123456');
    expect(store.getPeriods()).toHaveLength(1);
    expect(store.getMeters()).toMatchObject({ start: 4800, current: 5321.4 });
    expect(localStorage.getItem('kwh_price')).toBeNull(); // nicht ausgewählt
    expect(undoImport()).toBe(true);
    expect(store.getWallbox().isConfigured).toBe(false);
    expect(store.getPeriods()).toEqual([]);
  });

  it('nur ausgewählte Bereiche landen im Export', () => {
    const payload = buildPayload(['prices']);
    expect(Object.keys(payload.data)).toEqual(['prices']);
    expect(JSON.stringify(payload)).not.toContain(v1Storage.goe_api_token);
  });
});

describe('Personen & automatische Sicherung', () => {
  it('Karte gehört immer nur zu einem Profil; Löschen entfernt Zuordnungen', () => {
    store.saveProfile({ id: 'a', name: 'A', cards: ['Alex'] });
    store.saveProfile({ id: 'b', name: 'B', cards: ['Alex', 'Sam Fob'] });
    expect(store.getProfiles().find((p) => p.id === 'a').cards).toEqual([]);
    store.setSessionOwners(['s1', 's2'], 'b');
    store.setMe('b');
    store.deleteProfile('b');
    expect(store.getSessionOwners()).toEqual({});
    expect(store.getMe()).toBeNull();
  });

  it('Personen werden geteilt, "Das bin ich" nicht', () => {
    store.saveProfile({ id: 'a', name: 'A', cards: ['Alex'] });
    store.setSessionOwners(['s3'], 'a');
    store.setMe('a');
    const payload = buildPayload(['people']);
    expect(payload.data.people.profiles).toHaveLength(1);
    expect(payload.data.people.owners).toEqual({ s3: 'a' });
    expect(JSON.stringify(payload)).not.toContain('wall_e_me');
    localStorage.clear();
    applyPayload(payload, ['people']);
    expect(store.getProfiles()[0].name).toBe('A');
    expect(store.getMe()).toBeNull();
  });

  it('Sicherung beim ersten Start von V2 und Wiederherstellen', () => {
    expect(store.hasV1Data()).toBe(true);
    store.createLocalBackup();
    const backup = store.getLocalBackup();
    expect(backup.values.billing_periods).toBe(v1Storage.billing_periods);
    store.createLocalBackup(); // zweiter Aufruf überschreibt nicht
    expect(store.getLocalBackup().at).toBe(backup.at);
    localStorage.setItem('billing_periods', '[]');
    store.restoreLocalBackup();
    expect(store.getPeriods()).toHaveLength(1);
  });

  it('"Alle Daten löschen" lässt den Willkommens-Status stehen', () => {
    store.setWelcomeSeen('2');
    store.clearAll();
    expect(store.getWelcomeSeen()).toBe('2');
    expect(store.getWallbox().isConfigured).toBe(false);
  });
});
