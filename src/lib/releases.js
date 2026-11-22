// Neuerungen je Version – erscheinen einmal nach einem Update („Neu in Wall-E …“).
// Neue Version: oben einen Eintrag ergänzen (kurz, für Nutzer geschrieben) und package.json anheben.
// icon: Name eines Heroicons, das components/WhatsNew.jsx kennt.

export const RELEASES = [
  {
    version: '2.1.0',
    items: [
      { icon: 'sync', title: 'Gemeinsam nutzen', text: 'Zählerstände, Zuordnungen, Personen, Preise und Abrechnungen gleichen sich zwischen euren Handys ab – mit Namen, z. B. „Alex hat den Zählerstand eingetragen“.' },
      { icon: 'lock', title: 'Ende-zu-Ende verschlüsselt', text: 'Der Server sieht nur Zeichensalat und löscht jede Änderung, sobald alle sie übernommen oder abgelehnt haben.' },
      { icon: 'bell', title: 'Benachrichtigungen', text: 'Auf Wunsch auch bei geschlossener App. Pro Handy einstellbar: automatisch übernehmen oder erst fragen.' },
      { icon: 'users', title: 'Personen & Geräte', text: 'Alle mit Namen und ihren Geräten sehen, einladen per Link oder QR-Code, Geräte entfernen.' }
    ],
    action: { label: 'Gemeinsam nutzen einrichten', to: '/einstellungen/gemeinsam' }
  },
  {
    version: '2.0.1',
    items: [
      { icon: 'calc', title: 'Genauere Abrechnung', text: 'Hauszähler und Wallbox werden über denselben Zeitraum verglichen. Ist der Ladeverlust unplausibel, rechnet Wall-E vorläufig und erinnert ans Ablesen.' },
      { icon: 'receipt', title: 'Rechenweg pro Person', text: 'Person antippen: geladen + Ladeverlust = zu zahlen, in Euro und kWh.' },
      { icon: 'chart', title: 'Wer hat wann geladen', text: 'Eine Zeitleiste zeigt Woche für Woche, wer wie viel geladen hat.' }
    ]
  }
];

// "2.10.0" > "2.9.1"
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Was ist neu seit der zuletzt gesehenen Version? (neueste zuerst, höchstens drei Versionen)
export function releasesSince(seen, current, releases = RELEASES) {
  return releases.filter((r) => compareVersions(r.version, current) <= 0 && (!seen || compareVersions(r.version, seen) > 0)).slice(0, 3);
}
