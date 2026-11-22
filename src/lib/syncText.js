// Texte für Änderungen anderer Geräte („Alex hat den Zählerstand eingetragen …“).
// Der Text entsteht beim Absender und reist verschlüsselt mit – so kann auch die Push-Benachrichtigung
// ihn anzeigen, ohne die Rechenlogik zu kennen.
import { getMe, getProfiles } from './storage.js';
import { formatNumber, formatPrice } from './format.js';

// Name dieses Geräts: „Das bin ich“ (Profil oder Karte), sonst neutral
export function myName() {
  const me = getMe();
  if (!me) return 'Jemand';
  if (me.startsWith('card:')) return me.slice(5);
  const profile = getProfiles().find((p) => p.id === me);
  return profile ? profile.name : 'Jemand';
}

function ownerName(key) {
  if (!key) return null;
  if (key.startsWith('card:')) return key.slice(5);
  const profile = getProfiles().find((p) => p.id === key);
  return profile ? profile.name : null;
}

const when = (iso) =>
  new Date(iso).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function describeChange(type, data, name) {
  switch (type) {
    case 'meter':
      return `${name} hat den Zählerstand eingetragen: ${formatNumber(Number(data.current), 2)} kWh${data.currentAt ? ` (abgelesen ${when(data.currentAt)})` : ''}`;
    case 'billing':
      if (data.what === 'close') return `${name} hat die Abrechnung ${data.label ? `„${data.label}“ ` : ''}abgeschlossen`;
      if (data.what === 'delete') return `${name} hat eine abgeschlossene Abrechnung gelöscht`;
      if (data.what === 'edit') return `${name} hat eine abgeschlossene Abrechnung geändert`;
      return `${name} hat den Startwert geändert: ${formatNumber(Number(data.startMeter), 2)} kWh`;
    case 'owners': {
      const entries = Object.values(data.changes || {});
      const assigned = entries.filter(Boolean);
      if (assigned.length === 0) return `${name} hat bei ${count(entries.length, 'Ladung', 'Ladungen')} die Zuordnung entfernt`;
      const names = [...new Set(assigned.map(ownerName).filter(Boolean))];
      return `${name} hat ${count(assigned.length, 'Ladung', 'Ladungen')} ${names.length === 1 ? `${names[0]} ` : ''}zugeordnet`;
    }
    case 'profile':
      if (data.remove) return `${name} hat die Person „${data.name || 'unbekannt'}“ entfernt`;
      return `${name} hat die Person „${data.upsert.name}“ ${data.isNew ? 'angelegt' : 'geändert'}`;
    case 'prices':
      return `${name} hat den Strompreis geändert${data.price ? `: ${formatPrice(Number(data.price))}` : ''}`;
    case 'settings':
      if (data.what === 'loss') return `${name} hat den pauschalen Ladeverlust auf ${formatNumber(Number(data.standardLoss ?? 1.8), 1)} % geändert`;
      if (data.what === 'unassigned') return `${name} lässt Ladungen ohne Zuordnung jetzt ${data.unassignedMode === 'split' ? 'anteilig verteilen' : 'als eigene Zeile anzeigen'}`;
      return `${name} hat Einstellungen der Abrechnung geändert`;
    case 'snapshot':
      return `${name} hat den kompletten Stand geteilt (Abrechnungen, Personen, Zuordnungen, Strompreise)`;
    default:
      return `${name} hat etwas geändert`;
  }
}
