# Gespeicherte Daten

Alles liegt im `localStorage` der Domain, unter der Wall-E läuft. Zugriff nur über `src/lib/storage.js`.
Auf dem iPhone haben Safari und die installierte App **getrennte** Speicher.

## Schlüssel

| Schlüssel | Seit | Inhalt |
|---|---|---|
| `goe_serial_number` | V1 | Seriennummer (nur Buchstaben/Ziffern) |
| `goe_api_token` | V1 | Cloud-API-Token |
| `wall_e_wallbox_name` | V2 | optionaler Name der Wallbox |
| `wall_e_demo` | V1 | `"1"` = Demo-Modus (echte Daten bleiben unberührt) |
| `kwh_price` | V1 | aktiver Preis €/kWh als Text mit Punkt, z. B. `"0.35"`; fehlt → 0,39 |
| `kwh_price_history` | V1 | `[{ id, label, price, createdAt }]`, neueste zuerst |
| `energy_meter_reading` / `_timestamp` | V1 | aktueller Hauszähler (kWh, Text) + ISO-Zeit |
| `before_meter_reading` / `_timestamp` | V1 | Startwert Hauszähler (kWh, Text) + ISO-Zeit |
| `billing_baseline` | V1 | `{ totalEnergyKwh, meterReading, cards?, at? }` – Stand beim letzten Abschluss (`cards`, `at` seit V2) |
| `billing_periods` | V1 | abgeschlossene Abrechnungen, neueste zuerst (Format unten) |
| `saved_stats` | V1 | alte „Snapshots“ (nur noch lesen/löschen) |
| `darkMode` | V1 | `"true"`/`"false"`; fehlt → System-Design |
| `wall_e_import_undo` | V2 | Werte vor dem letzten Import `{ at, values: { key: alterWert } }` |
| `wall_e_profiles` | V2 | Profile `[{ id, name, cards: [Kartenname], chargeKw?, createdAt }]` – eine Karte gehört höchstens einem Profil; `chargeKw` = typische Ladeleistung des Autos |
| `wall_e_session_owners` | V2 | manuelle Zuordnung `{ Ladevorgangs-ID: Personen-Schlüssel }` (Profil-ID oder `card:<Name>`) |
| `wall_e_unassigned_mode` | V2 | fehlt = Ladungen ohne Zuordnung als eigene Zeile; `"split"` = anteilig verteilen |
| `wall_e_me` | V2 | „Das bin ich“ auf diesem Gerät (Personen-Schlüssel) – **wird nicht geteilt** |
| `wall_e_sessions` / `_at` | V2 | Zwischenspeicher des go-e Ladeverlaufs (normalisiert, neueste zuerst) + Zeit der letzten Aktualisierung |
| `wall_e_history_link` | V2 | Export-Link von Hand, falls die Wallbox kein `dll` liefert (Rückfall: alter V1-Schlüssel `goe_export_url`) |
| `wall_e_welcome` | V2 | zuletzt gezeigter Willkommens-Bildschirm (`"2"`); bleibt bei „Alle Daten löschen“ stehen |
| `wall_e_backup_v1` | V2 | automatische Sicherung aller Werte beim ersten Start von V2 `{ at, values }` |
| `wallbox_sessions`, `wallbox_card_energies`, `goe_auth_cookies`, `goe_export_url` | V1 | Altlasten, ungenutzt, bleiben liegen |

### Abrechnung (`billing_periods[]`)

```js
{
  id, label, createdAt, note,
  chargedKwh, pricePerKwh, totalCost,          // totalCost = chargedKwh × pricePerKwh
  meterReading, meterConsumption,              // Hauszähler beim Abschluss, Differenz zum Start
  userBreakdown: [{ name, share, energyKwh, cost, personKey? }],   // name "Nicht zugeordnet" möglich
  source?: 'sessions' | 'cards', from?, to?,  // seit V2
  baselineBefore: { totalEnergyKwh, meterReading, cards? },
  baselineAfter:  { totalEnergyKwh, meterReading, cards? }   // = neue billing_baseline
}
```

## Ladevorgänge und Personen

- **Ladevorgang** (`wall_e_sessions[]`): `{ id, number, start, end (ms), kwh, card (Name|null), chip, maxKw, chargedSeconds }`.
- **Person** = Profil oder – solange eine Karte zu keinem Profil gehört – die Karte selbst (`card:<Name>`).
- **Wem gehört ein Ladevorgang?** manuelle Zuordnung → Profil/Karte der RFID-Karte → „nicht zugeordnet“.
  Eine Zuordnung zu `card:<Name>` wandert mit, wenn die Karte später in ein Profil kommt.
- **Zeitraum:** Ein Ladevorgang zählt zu der Abrechnung, in der er **endet** (laufende Ladungen gehen so nie verloren).
  Beginn der laufenden Abrechnung: `billing_baseline.at`, sonst das spätere Datum von letztem Abschluss und Startwert.

## Vorschläge (`src/lib/suggest.js`)

- Kennzahlen pro Ladevorgang: Dauer mit Stromfluss, Ø-Leistung (kWh ÷ Ladezeit), Spitzenleistung (`max_power`).
- Typische Leistung je Person: `chargeKw` aus dem Profil, sonst Median der Spitzenleistung ihrer Ladevorgänge (ab 3 Stück, nur ≥ 1 kWh).
- Vorschlag nur, wenn genau eine Person passt: Abweichung ≤ 25 % und die zweitbeste mindestens 15 Prozentpunkte schlechter.
  Vorschläge werden nie automatisch gespeichert – erst beim Tippen auf „zuordnen“ bzw. „Alle übernehmen“.

## Rechenweg (laufende Abrechnung)

**Mit Ladeverlauf** (Standard, sobald Ladevorgänge geladen sind): kWh pro Person = Summe ihrer Ladevorgänge seit
Beginn. Nicht zugeordnete Ladungen: eigene Zeile oder anteilig verteilt (`wall_e_unassigned_mode`).
Ladeverlust und Kosten wie unten (Schritte 3–4).

**Ohne Ladeverlauf** (Rückfall, wie V1):

1. Karten mit Namen (≠ `n/a`) und Energie > 0; Energie der API in Wh → kWh, auf 2 Stellen gerundet.
2. Verbrauch seit Start:
   - mit `baseline.cards` (ab dem ersten Abschluss in V2): pro Karte `aktuell − Start`;
   - sonst wie V1: `Summe aktuell − baseline.totalEnergyKwh`, verteilt nach dem Gesamtanteil jeder Karte.
3. Hauszähler: `aktuell − Start`. Faktor = Hauszähler / Wallbox. Ist der Faktor ≤ 1 (kein oder
   unplausibler Zählerstand), gilt pauschal 1,8 % Ladeverlust (V1).
4. Kosten pro Person = kWh × Preis × Faktor.

Beim **Abschließen**: kWh = Hauszähler seit Start (änderbar), verteilt nach den Anteilen aus Schritt 2,
Kosten = kWh × Preis. Neue Basislinie = aktueller Stand inkl. `cards`.

## Unterschiede V1 → V2 (bewusst)

- **Startwert:** V1 schrieb beim Abschließen nur `billing_baseline` fort, `before_meter_reading` blieb alt
  stehen – der Ladeverlust war danach falsch. V2 nimmt `billing_baseline.meterReading` als Startwert und
  schreibt `before_meter_reading` beim Abschließen mit.
- **Verbrauch pro Person:** V1 verteilte nach dem Gesamtanteil aller Zeiten. V2 speichert beim Abschluss
  die Kartenstände und rechnet ab dann den echten Verbrauch pro Karte. Bis zum ersten Abschluss in V2
  rechnet V2 genau wie V1.
- **Letzte Abrechnung löschen:** V1 setzte dann alles zurück; V2 kehrt zum Stand vor dieser Abrechnung zurück.
- **Kiosk:** V1 zeigte Gesamtstände aller Zeiten, V2 die laufende Abrechnung (wie die Abrechnungsseite).
- **Snapshots:** werden nicht mehr erstellt; beim Abschließen legt V2 keinen Zusatz-Snapshot mehr an.
- **Grundlage:** Mit Ladeverlauf rechnet V2 pro Ladevorgang statt über Kartenstände. Ladungen ohne Karte
  landen nicht mehr unsichtbar im Ladeverlust, sondern als eigene Zeile (oder anteilig, einstellbar).

## Teilen & Sichern

Format (Datei = JSON, Link = `…/import#wall-e=1.<z|j><base64url>`, `z` = deflate-raw-komprimiert):

```js
{ format: 'wall-e', version: 1, createdAt, data: {
  wallbox?:  { serial, token, name },
  prices?:   { active, history },
  billing?:  { baseline, startMeter, startMeterAt, currentMeter, currentMeterAt, periods, snapshots },
  people?:   { profiles, owners, unassignedMode },   // ohne "Das bin ich"
  settings?: { darkMode }
} }
```

Der Link-Teil hinter `#` wird nie an den Server geschickt und nach dem Einlesen aus der Adresszeile entfernt.
Import ersetzt die ausgewählten Bereiche; der vorherige Stand wird in `wall_e_import_undo` gemerkt.
Der Ladeverlauf selbst wird nicht geteilt – das andere Gerät lädt ihn mit dem Wallbox-Zugang selbst.

## Erster Start von V2

`main.jsx` legt **vor dem ersten Rendern** `wall_e_backup_v1` an (alle Schlüssel), wenn V1-Daten da sind und
der Willkommens-Bildschirm noch nicht gezeigt wurde. Wiederherstellen: Teilen & Sichern →
„Stand vor Version 2 wiederherstellen“. Der Willkommens-Bildschirm bietet zusätzlich eine Sicherungsdatei an.
