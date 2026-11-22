// Zeitleiste der laufenden Abrechnung: Ladevorgänge nach Tag, Woche oder Monat, aufgeteilt nach Person.
import { ownerOf, sessionsInRange, UNASSIGNED } from './people.js';

const DAY = 24 * 60 * 60 * 1000;

// Einheit nach Länge des Zeitraums: bis 31 Tage täglich, bis ein Jahr wöchentlich, sonst monatlich
export function timelineUnit(spanMs) {
  if (spanMs <= 31 * DAY) return 'day';
  if (spanMs <= 366 * DAY) return 'week';
  return 'month';
}

// Beginn des Abschnitts (lokale Zeit): Tag 0 Uhr, Woche ab Montag, Monat ab dem 1.
export function bucketStart(ms, unit) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  if (unit === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (unit === 'month') d.setDate(1);
  return d.getTime();
}

export function nextBucket(ms, unit) {
  const d = new Date(ms);
  if (unit === 'day') d.setDate(d.getDate() + 1);
  if (unit === 'week') d.setDate(d.getDate() + 7);
  if (unit === 'month') d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/**
 * Ladevorgänge der laufenden Abrechnung (wie in der Abrechnung: alle, die seit Beginn enden),
 * eingeordnet nach Ladebeginn – frühestens in den ersten Abschnitt.
 * @returns { unit, buckets: [{ start, end, kwh, count, parts: [{ key, kwh, count }] }] } – parts in Reihenfolge der Personen, "none" zuletzt
 */
export function timelineBuckets({ sessions, persons, owners, from, now = Date.now() }) {
  const list = sessionsInRange(sessions, from, null);
  if (list.length === 0) return { unit: 'day', buckets: [] };
  const begin = from !== null && from !== undefined ? from : Math.min(...list.map((s) => s.start));
  const end = Math.max(now, ...list.map((s) => s.end));
  const unit = timelineUnit(end - begin);

  const buckets = [];
  for (let t = bucketStart(begin, unit); t <= end; t = nextBucket(t, unit)) {
    // shownStart: für Beschriftungen – der erste Abschnitt beginnt sichtbar erst mit der Abrechnung
    buckets.push({ start: t, shownStart: Math.max(t, begin), end: nextBucket(t, unit), kwh: 0, count: 0, byKey: new Map() });
  }
  const order = [...persons.map((p) => p.key), UNASSIGNED];
  list.forEach((s) => {
    const at = Math.max(s.start, buckets[0].start);
    const bucket = buckets.find((b) => at >= b.start && at < b.end) || buckets[buckets.length - 1];
    const key = ownerOf(s, persons, owners);
    const part = bucket.byKey.get(key) || { key, kwh: 0, count: 0 };
    part.kwh += s.kwh;
    part.count += 1;
    bucket.byKey.set(key, part);
    bucket.kwh += s.kwh;
    bucket.count += 1;
  });
  return {
    unit,
    buckets: buckets.map(({ byKey, ...b }) => ({ ...b, parts: order.filter((k) => byKey.has(k)).map((k) => byKey.get(k)) }))
  };
}

// Beschriftungen unter der Zeitleiste: Monatsanfänge (bei Tagen: Wochenanfänge), mit Mindestabstand
export function timelineTicks(buckets, unit, minGap = Math.max(3, Math.round(buckets.length / 6))) {
  const ticks = [];
  buckets.forEach((b, i) => {
    const d = new Date(b.shownStart ?? b.start);
    const prev = i > 0 ? new Date(buckets[i - 1].shownStart ?? buckets[i - 1].start) : null;
    const isNew = unit === 'day' ? i === 0 || d.getDay() === 1 : !prev || prev.getMonth() !== d.getMonth();
    if (!isNew) return;
    if (ticks.length && i - ticks[ticks.length - 1].index < minGap) return;
    const label = unit === 'day' ? d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }) : d.toLocaleDateString('de-DE', { month: 'short' });
    ticks.push({ index: i, label });
  });
  // letzte Beschriftung darf nicht über den Rand laufen
  return ticks.filter((t) => t.index <= buckets.length - 2 || buckets.length < 4);
}

// Zeitraum eines Abschnitts als Text, z. B. "12.–18. Okt. 2026", "5. Nov. 2026", "Okt. 2026"
export function bucketLabel(bucket, unit) {
  const start = new Date(bucket.shownStart ?? bucket.start);
  const last = new Date(bucket.end - 1);
  if (unit === 'month') return start.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  if (unit === 'day') return start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const sameMonth = start.getMonth() === last.getMonth();
  const from = start.toLocaleDateString('de-DE', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${from.replace(/\.$/, '')}.–${last.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
