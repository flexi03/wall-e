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
| `energy_meter_reading` / `_timestamp` | V1 | aktueller Hauszähler (kWh, Text) + ISO-Zeit der Ablesung (seit V2 frei wählbar, sonst Zeit des Eintragens) |
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
| `wall_e_sessions_from` | V2 | ab wann der Ladeverlauf schon einmal vollständig nachgeladen wurde (ISO) – verhindert wiederholtes Nachladen |
| `wall_e_standard_loss` | V2 | pauschaler Ladeverlust in % als Text, z. B. `"1.6"`; fehlt → 1,8 % (V1) |
| `wall_e_sync` | 2.1 | Gemeinsam nutzen: `{ key, device, auto, notify, devices?, vapidKey? }` – `key` = Gruppenschlüssel (geheim), `device` = Kennung dieses Geräts |
| `wall_e_sync_inbox` / `_outbox` | 2.1 | Änderungen anderer, die auf „Übernehmen/Ablehnen“ warten / eigene, noch nicht gesendete |
| `wall_e_sync_stamps` | 2.1 | Zeitpunkt der letzten Änderung je Bereich (`billing`, `prices`, `settings`) – ältere fremde Änderungen werden nicht übernommen |
| IndexedDB `wall-e` / `kv` / `sync` | 2.1 | Kopie von `{ key, device }` für den Service Worker (Benachrichtigungen) |
| `wall_e_history_link` | V2 | Export-Link von Hand, falls die Wallbox kein `dll` liefert (Rückfall: alter V1-Schlüssel `goe_export_url`) |
| `wall_e_seen_version` | 2.1 | App-Version, deren Neuerungen zuletzt gezeigt wurden; fehlt bei bestehenden Nutzern → gilt als 2.0.0. Bleibt bei „Alle Daten löschen“ |
| `wall_e_sync_removed` | 2.1 | Zeitpunkt, an dem ein anderes Gerät dieses aus „Gemeinsam nutzen“ entfernt hat (Hinweis) |
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
  Beginn der laufenden Abrechnung = Zeitpunkt des Startwerts: `billing_baseline.at`; sonst – wenn der Startwert vom
  letzten Abschluss stammt (gleicher Zählerstand) – dieser Abschluss; sonst das spätere Datum von Abschluss und
  `before_meter_timestamp` (V1: „Baseline speichern“). „Startwert korrigieren“ ändert nur die Zahl, nicht den Beginn
  (er wird dafür als `at` in der Basislinie festgehalten).
- **Vollständiger Verlauf:** Ist der älteste gespeicherte Ladevorgang jünger als der Beginn der Abrechnung, lädt
  Wall-E den Zeitraum ab Beginn (minus 7 Tage) einmal gezielt nach (`wall_e_sessions_from`).

## Vorschläge (`src/lib/suggest.js`)

- Kennzahlen pro Ladevorgang (`sessionStats`): angesteckt = Ende − Beginn; geladen = go-e `seconds_charged`;
  Standzeit = angesteckt − geladen (in Stunden und % der Ansteckzeit); Ø-Leistung = kWh ÷ **reine Ladezeit**
  (ohne Ladezeit von go-e: keine Ø-Leistung); Spitzenleistung = `max_power`.
- Typische Leistung je Person: `chargeKw` aus dem Profil, sonst Median der Spitzenleistung ihrer Ladevorgänge (ab 3 Stück, nur ≥ 1 kWh).
- Eine Person kommt erst ab dem Zeitpunkt in Frage, ab dem es sie gibt: erster Ladevorgang mit ihrer Karte bzw. ihr
  zugeordnet, ohne Ladevorgänge `createdAt` des Profils. Eine neue Karte mit gleicher Leistung stört so ältere Vorschläge nicht.
- Vorschlag nur, wenn genau eine Person passt: Abweichung ≤ 25 % und die zweitbeste mindestens 15 Prozentpunkte schlechter.
  Vorschläge werden nie automatisch gespeichert – erst beim Tippen auf „zuordnen“ bzw. „Alle übernehmen“.

## Rechenweg (laufende Abrechnung)

**Mit Ladeverlauf** (Standard, sobald Ladevorgänge geladen sind): kWh pro Person = Summe ihrer Ladevorgänge seit
Beginn. Nicht zugeordnete Ladungen: eigene Zeile oder anteilig verteilt (`wall_e_unassigned_mode`).

Ladeverlust (`measureLoss` in `src/lib/people.js`) – Hauszähler und Wallbox immer über **denselben Zeitraum**:

1. Hauszähler = aktuell − Start (Start = Ablesung zu Beginn, aktuell = letzte Ablesung mit ihrem Zeitpunkt).
2. Wallbox bis zur Ablesung = Ladevorgänge, die zwischen Beginn und Ablesung enden.
3. Verlust = Hauszähler ÷ Wallbox bis zur Ablesung − 1. Gilt als **gemessen**, wenn er zwischen 0 und 15 % liegt
   und bis zur Ablesung mindestens 20 kWh geladen wurden.
4. Sonst (noch nicht abgelesen, zu wenig geladen, Zählerstand veraltet oder unplausibel) gilt **vorläufig** der
   pauschale Wert (`wall_e_standard_loss`, sonst 1,8 %). Die App zeigt dann „Vorläufig … – bitte Hauszähler ablesen“.
5. Kosten pro Person = kWh × Preis × (1 + Verlust); Gesamt = Summe aller Zeilen. Ladungen nach der Ablesung bekommen
   denselben Faktor. Bei „Alle“ steht oben die Wallbox-Summe (= Summe der Zeilen) und darunter der Ladeverlust.
6. **Zu bezahlen** (tatsächlicher Verbrauch) = Hauszähler bis zur Ablesung + danach Geladenes × Faktor
   (= Wallbox × Faktor). Pro Person: Anteil an den Ladevorgängen × zu bezahlen; Differenz = Ladeverlust-Anteil.
   Auf der Abrechnungsseite: „So wird gerechnet“ (gesamt) und je Person zum Aufklappen. Bei unplausiblem Verlust
   erinnert auch die Live-Seite.

Zeitleiste (`src/lib/timeline.js`): dieselben Ladevorgänge wie die Abrechnung, eingeordnet nach Ladebeginn
(frühestens im ersten Abschnitt), bis 31 Tage täglich, bis ein Jahr wöchentlich (ab Montag), sonst monatlich.

Ohne Ladeverlauf (Kartenstände) bleibt es bei der V1-Rechnung unten.

**Ohne Ladeverlauf** (Rückfall, wie V1):

1. Karten mit Namen (≠ `n/a`) und Energie > 0; Energie der API in Wh → kWh, auf 2 Stellen gerundet.
2. Verbrauch seit Start:
   - mit `baseline.cards` (ab dem ersten Abschluss in V2): pro Karte `aktuell − Start`;
   - sonst wie V1: `Summe aktuell − baseline.totalEnergyKwh`, verteilt nach dem Gesamtanteil jeder Karte.
3. Hauszähler: `aktuell − Start`. Faktor = Hauszähler / Wallbox. Ist der Faktor ≤ 1 (kein oder
   unplausibler Zählerstand), gilt der pauschale Ladeverlust (V1: 1,8 %, einstellbar über `wall_e_standard_loss`).
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
- **Ladeverlust mit Ladeverlauf:** nur über denselben Zeitraum wie der Hauszähler gemessen, mit Plausibilitätsgrenze
  0–15 %; sonst vorläufig pauschal (siehe oben). V1 verglich Gesamtstände ohne Zeitbezug.
- **Grundlage:** Mit Ladeverlauf rechnet V2 pro Ladevorgang statt über Kartenstände. Ladungen ohne Karte
  landen nicht mehr unsichtbar im Ladeverlust, sondern als eigene Zeile (oder anteilig, einstellbar).

## Gemeinsam nutzen (ab 2.1)

Optional. Änderungen werden Ende-zu-Ende verschlüsselt über `server/api/sync.php` an die anderen Geräte weitergereicht.

- **Schlüssel:** 32 zufällige Byte, entstehen auf dem ersten Gerät, reisen nur im Teilen-Link/QR-Code/Datei (Bereich `sync`).
  Daraus per HKDF (`src/lib/crypto.js`): Gruppen-Kennung und Zugangsnachweis für den Server, AES-256-GCM-Schlüssel
  (bleibt auf dem Gerät). Der Server speichert nur den SHA-256 des Zugangsnachweises, Geräte-Kennungen und Chiffretext.
- **Änderung** (`src/lib/sync.js`): `{ v, id, at, by: { name, device }, type, data, text }` – `text` z. B. „Alex hat den
  Zählerstand eingetragen …“ (Name aus „Das bin ich“). Typen: `meter`, `billing` (Startwert, Abschluss, Bearbeiten, Löschen –
  ganzer Abrechnungsstand in V1-Formaten), `owners`, `profile`, `prices`, `settings`. Gemeldet von den Schreibfunktionen in
  `storage.js` (`onLocalChange`), gesammelt 1,5 s, dann gesendet.
- **Übernehmen** (`applyRemote`): Zählerstand nur, wenn die Ablesung neuer ist; Abrechnung/Preise/Einstellungen nur, wenn
  die Änderung neuer ist als der eigene Stand; Zuordnungen und Personen werden zusammengeführt. Einspielen meldet keine
  neue Änderung. Pro Gerät: automatisch übernehmen (Hinweis) oder fragen (oben auf jeder Seite „Übernehmen/Ablehnen“).
- **Server:** Nachricht bleibt, bis alle anderen Geräte sie übernommen oder abgelehnt haben (dann gelöscht), höchstens 30 Tage.
  Geräte ohne Meldung seit 60 Tagen werden entfernt; ohne Geräte wird die Gruppe gelöscht. Daten in `api/sync-data/` (gesperrt).
- **Geräte:** Beim Anmelden schickt jedes Gerät verschlüsselt `{ name, me, label }` (z. B. „Alex“, „iPhone · App“).
  Der Server führt nur Kennung, „zuletzt aktiv“, Push ja/nein. Jedes Gerät kann ein anderes entfernen; die Kennung ist
  danach gesperrt (wer den Schlüssel noch hat, kann als neues Gerät beitreten).
- **Einladen:** Link/QR-Code nur mit dem Bereich `sync` → „Beitreten“, die Daten des Geräts bleiben unverändert.
  „Meinen Stand an alle senden“ (`snapshot`): Abrechnungen, Personen, Zuordnungen, Preise im Teilen-Format; wird immer
  nachgefragt, beim Übernehmen wie ein Import (rückgängig machbar), „Das bin ich“ bleibt (notfalls über den Namen).
- **Benachrichtigungen:** Web-Push ohne Inhalt (VAPID, Schlüssel in `api/sync-data/vapid.pem`). `public/sw.js` holt die
  offenen Änderungen, entschlüsselt sie auf dem Gerät und zeigt deren Text. iPhone: nur in der installierten App (iOS 16.4+).

## Teilen & Sichern

Format (Datei = JSON, Link = `…/import#wall-e=1.<z|j><base64url>`, `z` = deflate-raw-komprimiert):

```js
{ format: 'wall-e', version: 1, createdAt, data: {
  wallbox?:  { serial, token, name },
  prices?:   { active, history },
  billing?:  { baseline, startMeter, startMeterAt, currentMeter, currentMeterAt, standardLoss?, periods, snapshots },
  people?:   { profiles, owners, unassignedMode },   // ohne "Das bin ich"
  settings?: { darkMode },
  sync?:     { key }                               // ab 2.1, Gerät bekommt beim Import eine eigene Kennung
} }
```

Der Link-Teil hinter `#` wird nie an den Server geschickt und nach dem Einlesen aus der Adresszeile entfernt.
Import ersetzt die ausgewählten Bereiche; der vorherige Stand wird in `wall_e_import_undo` gemerkt.
Der Ladeverlauf selbst wird nicht geteilt – das andere Gerät lädt ihn mit dem Wallbox-Zugang selbst.

## Erster Start von V2

`main.jsx` legt **vor dem ersten Rendern** `wall_e_backup_v1` an (alle Schlüssel), wenn V1-Daten da sind und
der Willkommens-Bildschirm noch nicht gezeigt wurde. Wiederherstellen: Teilen & Sichern →
„Stand vor Version 2 wiederherstellen“. Der Willkommens-Bildschirm bietet zusätzlich eine Sicherungsdatei an.
