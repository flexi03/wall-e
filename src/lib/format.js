// Einheitliche Zahlen-, Geld- und Datumsformate (deutsch)

const nf = (min, max) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });
const kwhFormat = nf(1, 1);
const kwhPreciseFormat = nf(2, 2);
const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const priceFormat = nf(2, 3);

const ok = (n) => typeof n === 'number' && isFinite(n);

export const formatKwh = (n, precise = false) => (ok(n) ? `${(precise ? kwhPreciseFormat : kwhFormat).format(n)} kWh` : '–');
export const formatNumber = (n, digits = 1) => (ok(n) ? nf(digits, digits).format(n) : '–');
export const formatEuro = (n) => (ok(n) ? euroFormat.format(n) : '–');
export const formatPrice = (n) => (ok(n) ? `${priceFormat.format(n)} €/kWh` : '–');
export const formatPercent = (n) => (ok(n) ? `${nf(1, 1).format(n)} %` : '–');
export const formatKw = (w) => (ok(w) ? `${nf(1, 1).format(w / 1000)} kW` : '–');

// Wert für ein Eingabefeld (Komma statt Punkt, ohne Tausenderpunkte)
export const toInput = (n, digits = 2) => (ok(n) ? String(Math.round(n * 10 ** digits) / 10 ** digits).replace('.', ',') : '');

export function formatDate(iso, withTime = false) {
  if (!iso) return '–';
  const date = new Date(iso);
  if (isNaN(date)) return '–';
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  });
}

export function formatRelative(iso) {
  if (!iso) return '';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 10) return 'gerade eben';
  if (seconds < 60) return `vor ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  return formatDate(iso);
}
