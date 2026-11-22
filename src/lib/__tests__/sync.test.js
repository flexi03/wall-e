import { describe, it, expect, beforeEach } from 'vitest';
import * as store from '../storage.js';
import { deriveGroup, encryptJson, decryptJson, newGroupKey, isGroupKey } from '../crypto.js';
import { buildChange, queueChange } from '../sync.js';
import { describeChange } from '../syncText.js';
import { buildPayload, decodePayload, encodePayload, applyPayload, availableSections } from '../share.js';
import { seed } from './fixtures.js';

beforeEach(() => seed());

const enable = () => store.setSync({ key: newGroupKey(), device: 'geraet-a-0000000000', auto: true, notify: false });

describe('Verschlüsselung', () => {
  it('Schlüssel → Gruppe, Zugang und AES; Rundreise; fremde Gruppe kann nicht entschlüsseln', async () => {
    const key = newGroupKey();
    expect(isGroupKey(key)).toBe(true);
    const a = await deriveGroup(key);
    const again = await deriveGroup(key);
    expect(a.group).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.auth).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.group).toBe(again.group);
    expect(a.group).not.toBe(a.auth);
    expect(a.group).not.toContain(key);

    const sealed = await encryptJson(a, { text: 'Alex hat den Zählerstand eingetragen', n: 1 });
    expect(sealed.iv).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(sealed.data).not.toContain('Alex');
    expect(await decryptJson(again, sealed)).toEqual({ text: 'Alex hat den Zählerstand eingetragen', n: 1 });

    const other = await deriveGroup(newGroupKey());
    await expect(decryptJson(other, sealed)).rejects.toBeTruthy();
    await expect(decryptJson({ ...a, group: other.group }, sealed)).rejects.toBeTruthy();
  });
});

describe('Eigene Änderungen werden gemeldet', () => {
  it('nur wenn „Gemeinsam nutzen“ eingerichtet ist', () => {
    const seen = [];
    const off = store.onLocalChange((type, data) => seen.push({ type, data }));
    store.setCurrentMeter(5400, '2026-11-20T08:00:00.000Z');
    expect(seen).toHaveLength(0);
    enable();
    store.setCurrentMeter(5401.5, '2026-11-21T08:00:00.000Z');
    store.setSessionOwners(['s1', 's2'], 'p1');
    store.setStandardLoss(1.6);
    off();
    expect(seen.map((c) => c.type)).toEqual(['meter', 'owners', 'settings']);
    expect(seen[0].data).toEqual({ current: '5401.5', currentAt: '2026-11-21T08:00:00.000Z' });
    expect(seen[1].data).toEqual({ changes: { s1: 'p1', s2: 'p1' } });
  });

  it('Abrechnung abschließen meldet den ganzen Abrechnungsstand', () => {
    enable();
    const seen = [];
    const off = store.onLocalChange((type, data) => seen.push({ type, data }));
    const periods = store.getPeriods();
    store.savePeriods([{ id: 'neu', label: 'November 2026', createdAt: '2026-11-22T10:00:00Z', chargedKwh: 10, pricePerKwh: 0.3, totalCost: 3 }, ...periods], { totalEnergyKwh: 1, meterReading: 6000, at: '2026-11-22T10:00:00Z' });
    off();
    expect(seen[0].type).toBe('billing');
    expect(seen[0].data).toMatchObject({ what: 'close', label: 'November 2026', startMeter: '6000' });
    expect(seen[0].data.periods).toHaveLength(periods.length + 1);
  });
});

describe('Fremde Änderungen einspielen', () => {
  const change = (type, data, at = '2026-11-22T12:00:00.000Z') => ({ id: `c-${type}-${at}`, at, type, data, by: { name: 'Sam', device: 'geraet-b-0000000000' } });

  it('Zählerstand: neuere Ablesung gewinnt, ältere wird nicht übernommen', () => {
    enable();
    store.setCurrentMeter(6000, '2026-11-20T08:00:00.000Z');
    expect(store.applyRemote(change('meter', { current: '6100', currentAt: '2026-11-21T08:00:00.000Z' }))).toBe(true);
    expect(store.getMeters()).toMatchObject({ current: 6100, currentAt: '2026-11-21T08:00:00.000Z' });
    expect(store.applyRemote(change('meter', { current: '5900', currentAt: '2026-11-19T08:00:00.000Z' }))).toBe(false);
    expect(store.getMeters().current).toBe(6100);
  });

  it('Einspielen löst keine neue eigene Änderung aus (kein Hin und Her)', () => {
    enable();
    const seen = [];
    const off = store.onLocalChange((type) => seen.push(type));
    store.applyRemote(change('owners', { changes: { s9: 'p2' } }));
    store.applyRemote(change('profile', { upsert: { id: 'p9', name: 'Neu', cards: [] }, isNew: true }));
    off();
    expect(seen).toEqual([]);
    expect(store.getSessionOwners().s9).toBe('p2');
    expect(store.getProfiles().some((p) => p.id === 'p9')).toBe(true);
  });

  it('ganze Bereiche: ältere Änderung als der eigene Stand wird nicht übernommen', () => {
    enable();
    expect(store.applyRemote(change('settings', { unassignedMode: 'split', standardLoss: '1.6' }, '2026-11-22T12:00:00.000Z'))).toBe(true);
    expect(store.getStandardLoss()).toBeCloseTo(0.016, 9);
    expect(store.applyRemote(change('settings', { unassignedMode: null, standardLoss: '2' }, '2026-11-22T11:00:00.000Z'))).toBe(false);
    expect(store.getUnassignedMode()).toBe('split');
  });

  it('Abrechnung eines anderen Geräts ersetzt den Abrechnungsstand (V1-Formate)', () => {
    enable();
    const data = { what: 'close', label: 'Okt', baseline: { totalEnergyKwh: 10, meterReading: 7000, at: '2026-11-22T12:00:00.000Z' }, startMeter: '7000', startMeterAt: '2026-11-22T12:00:00.000Z', currentMeter: '7000', currentMeterAt: '2026-11-22T12:00:00.000Z', periods: [{ id: 'x', label: 'Okt', createdAt: '2026-11-22T12:00:00.000Z', chargedKwh: 5, pricePerKwh: 0.3, totalCost: 1.5 }] };
    expect(store.applyRemote(change('billing', data))).toBe(true);
    expect(store.getRaw('before_meter_reading')).toBe('7000');
    expect(store.getPeriods()).toHaveLength(1);
    expect(store.getMeters()).toMatchObject({ start: 7000, current: 7000 });
  });
});

describe('Nachrichten', () => {
  it('Text mit Namen aus „Das bin ich“; gleiche Bereiche werden zusammengefasst', () => {
    enable();
    store.saveProfile({ id: 'pa', name: 'Alex', cards: ['Alex'] });
    store.setMe('pa');
    const meter = buildChange('meter', { current: '6512', currentAt: '2026-11-22T17:10:00.000Z' });
    expect(meter.by).toEqual({ name: 'Alex', device: 'geraet-a-0000000000' });
    expect(meter.text).toMatch(/^Alex hat den Zählerstand eingetragen: 6\.512,00 kWh \(abgelesen /);

    let outbox = queueChange([], buildChange('owners', { changes: { s1: 'pa' } }));
    outbox = queueChange(outbox, buildChange('owners', { changes: { s2: 'pa' } }));
    outbox = queueChange(outbox, meter);
    outbox = queueChange(outbox, buildChange('meter', { current: '6513', currentAt: '2026-11-22T17:20:00.000Z' }));
    expect(outbox.map((c) => c.type)).toEqual(['owners', 'meter']);
    expect(outbox[0].data.changes).toEqual({ s1: 'pa', s2: 'pa' });
    expect(outbox[0].text).toBe('Alex hat 2 Ladungen Alex zugeordnet');
    expect(outbox[1].data.current).toBe('6513');
  });

  it('weitere Texte', () => {
    expect(describeChange('billing', { what: 'close', label: 'November 2026' }, 'Sam')).toBe('Sam hat die Abrechnung „November 2026“ abgeschlossen');
    expect(describeChange('profile', { remove: 'x', name: 'Kim' }, 'Sam')).toBe('Sam hat die Person „Kim“ entfernt');
    expect(describeChange('prices', { price: '0.282' }, 'Sam')).toBe('Sam hat den Strompreis geändert: 0,282 €/kWh');
    expect(describeChange('owners', { changes: { a: null } }, 'Sam')).toBe('Sam hat bei 1 Ladung die Zuordnung entfernt');
    expect(describeChange('settings', { what: 'loss', standardLoss: '1.6' }, 'Sam')).toBe('Sam hat den pauschalen Ladeverlust auf 1,6 % geändert');
  });
});

describe('Gerät hinzufügen per Teilen-Link', () => {
  it('Link enthält nur den Schlüssel (kein Gerät); das neue Gerät bekommt eine eigene Kennung', async () => {
    enable();
    const own = store.getSync();
    expect(availableSections()).toContain('sync');
    const payload = buildPayload(['sync']);
    expect(payload.data.sync).toEqual({ key: own.key });
    const copy = await decodePayload(await encodePayload(payload));

    localStorage.clear();
    applyPayload(copy, ['sync']);
    const joined = store.getSync();
    expect(joined.key).toBe(own.key);
    expect(joined.device).not.toBe(own.device);

    // gleicher Schlüssel noch einmal → Gerät bleibt dasselbe
    applyPayload(copy, ['sync']);
    expect(store.getSync().device).toBe(joined.device);
  });
});

import { deviceLabel, groupDevices, applySnapshot, SNAPSHOT_SECTIONS } from '../sync.js';
import { RELEASES, compareVersions, releasesSince } from '../releases.js';
import packageInfo from '../../../package.json';

describe('Neuerungen nach Updates', () => {
  it('Versionen vergleichen und passende Neuerungen finden', () => {
    expect(compareVersions('2.10.0', '2.9.1')).toBe(1);
    expect(compareVersions('2.1.0', '2.1.0')).toBe(0);
    expect(releasesSince('2.0.0', '2.1.0').map((r) => r.version)).toEqual(['2.1.0', '2.0.1']);
    expect(releasesSince('2.0.1', '2.1.0').map((r) => r.version)).toEqual(['2.1.0']);
    expect(releasesSince('2.1.0', '2.1.0')).toEqual([]);
  });

  it('zur aktuellen Version gibt es Neuerungen', () => {
    expect(RELEASES[0].version).toBe(packageInfo.version);
    RELEASES.forEach((r) => r.items.forEach((i) => expect(i.title && i.text).toBeTruthy()));
  });
});

describe('Geräte', () => {
  it('Bezeichnung aus dem Browser', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true)).toBe('iPhone · App');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Android · Chrome');
  });

  it('nach Personen gruppiert, eigene zuerst', () => {
    const groups = groupDevices([
      { id: 'a', name: 'Sam', person: 'ps', label: 'iPhone · App', mine: false },
      { id: 'b', name: 'Alex', person: 'pa', label: 'iPhone · App', mine: true },
      { id: 'c', name: 'Sam', person: 'ps', label: 'iPad · Safari', mine: false }
    ]);
    expect(groups.map((g) => [g.name, g.devices.length, g.mine])).toEqual([['Alex', 1, true], ['Sam', 2, false]]);
  });
});

describe('Kompletter Stand eines anderen Geräts', () => {
  it('ersetzt Abrechnung, Personen und Preise; „Das bin ich“ bleibt über den Namen erhalten; rückgängig machbar', () => {
    enable();
    store.saveProfile({ id: 'lokal-alex', name: 'Alex', cards: [] });
    store.setMe('lokal-alex');
    const data = {
      prices: { active: 0.3, history: [] },
      billing: { baseline: { totalEnergyKwh: 5, meterReading: 100 }, startMeter: '100', startMeterAt: null, currentMeter: '150', currentMeterAt: '2026-11-22T10:00:00.000Z', periods: [], snapshots: [] },
      people: { profiles: [{ id: 'fremd-alex', name: 'Alex', cards: ['Alex'] }, { id: 'fremd-sam', name: 'Sam', cards: ['Sam'] }], owners: { s1: 'fremd-sam' }, unassignedMode: null }
    };
    expect(SNAPSHOT_SECTIONS).toEqual(['prices', 'billing', 'people']);
    applySnapshot({ id: 'snap1', at: '2026-11-22T12:00:00.000Z', type: 'snapshot', data });
    expect(store.getProfiles().map((p) => p.id)).toEqual(['fremd-alex', 'fremd-sam']);
    expect(store.getMe()).toBe('fremd-alex');
    expect(store.getMeters()).toMatchObject({ start: 100, current: 150 });
    expect(store.getPrice().value).toBe(0.3);
    expect(store.getRaw('wall_e_import_undo')).toBeTruthy();
    // danach ist eine ältere Einzeländerung an der Abrechnung veraltet
    expect(store.applyRemote({ id: 'alt', at: '2026-11-22T11:00:00.000Z', type: 'prices', data: { price: '0.5', history: [] } })).toBe(false);
  });
});
