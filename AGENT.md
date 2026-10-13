# Wall-E – Hinweise für Agents und Entwickler

Wall-E ist eine kleine Web-App (PWA) für eine **go-e Wallbox**: Live-Status anzeigen, einzelne
Ladevorgänge Personen zuordnen und die Stromkosten fair aufteilen. Kein Konto, keine Datenbank –
alles liegt im Browser; ein kleiner PHP-Proxy reicht Anfragen an die go-e Cloud weiter.

Installations-spezifische Notizen (Server, Deploy, Domain) stehen – falls vorhanden – in `PRIVATE.md`.

## Die wichtigste Regel

**Die App muss nach jedem Update ohne Neuinstallation weiterlaufen, und keine Daten dürfen verloren gehen.**

- Alle Daten liegen im `localStorage` der Domain, unter der Wall-E läuft. Domain, `start_url` (`/`) und
  `scope` im Manifest nie ändern – sonst sind Daten und installierte App weg.
- Gespeicherte Schlüssel und Formate stammen aus V1 und bleiben **unverändert** (siehe `docs/DATA.md`).
  Neue Werte bekommen neue Schlüssel mit Präfix `wall_e_`. Keine stillen Migrationen, die alte Schlüssel umbauen.
- Lesen/Schreiben **nur** über `src/lib/storage.js`. Seiten greifen nie direkt auf `localStorage` zu.
- Rechenwege für Kosten stehen in `src/lib/billing.js` / `src/lib/people.js` und sind gegen die V1-Formeln
  getestet (`src/lib/__tests__/fixtures.js` → `v1Compute`). Vor jeder Änderung daran: `npm test`.
- Vor jedem Deploy im Browser mit V1-Testdaten prüfen (siehe „Testen“).

## Wiederverwendbarkeit

- `src/lib/` enthält **reine Logik ohne React** (Abrechnung, Personen, Vorschläge, go-e-Verlauf, Teilen,
  Formate). Neue Rechen- oder Datenlogik gehört dorthin, mit Tests in `src/lib/__tests__/`.
- `src/components/ui.jsx` ist das Design-System; Seiten bauen nur daraus (siehe `docs/DESIGN.md`).
- Nichts Installations-spezifisches im Code: Domain, Kontakt, Impressum und Dev-Proxy kommen aus
  `site.config.js` (Vorlage: `site.config.example.js`). Keine Personennamen, Seriennummern oder Tokens
  im Code, in Tests oder in der Doku – Beispielnamen sind „Alex“ und „Sam“.

## Aufbau

```
index.html, public/            Manifest, Icons, .htaccess (HTTPS, CSP, SPA-Rewrite, Caching)
site.config.example.js         Vorlage für eigene Werte (site.config.js, nicht veröffentlicht)
server/                        PHP-Proxy zur go-e Cloud: api/status.php, api/test.php (Live-Status),
                               api/history.php (Ladeverlauf), api/goe.php (gemeinsame Funktionen, Retry)
src/
  main.jsx, App.jsx            Einstieg, Routen (+ Weiterleitungen der V1-Adressen)
  lib/storage.js               Datenschicht (localStorage, V1-Schlüssel)
  lib/billing.js               Abrechnung nach Kartenständen + Abschluss
  lib/people.js                Personen/Profile, Zuordnung, Abrechnung nach Ladevorgängen
  lib/history.js               go-e Ladeverlauf laden, normalisieren, zusammenführen
  lib/suggest.js               Kennzahlen pro Ladevorgang, Zuordnungs-Vorschläge nach Ladeleistung
  lib/goe.js                   go-e Status über den Proxy (Timeout, vorübergehende Fehler), Demo-Daten
  lib/share.js                 Teilen & Sichern (Link/QR/Datei), Import mit Rückgängig
  lib/format.js                Zahlen-, Geld-, Datumsformate (de-DE)
  lib/install.js               „Als App installieren“
  hooks/data.js                useStored; StatusProvider (Live-Status, Retry/Backoff) + HistoryProvider
                               (Ladeverlauf); usePeople, usePersonFilter, useBilling, Theme
  components/ui.jsx            ALLE UI-Bausteine (Design-System)
  components/AppShell.jsx      Tab-Leiste (Handy/Tablet) bzw. Seitenleiste (Laptop)
  components/PersonPicker.jsx  Auswahl „Alle“/Person oben rechts
  components/Welcome.jsx       Willkommens-Bildschirm beim ersten Start von V2
  pages/                       Live, Abrechnung, Verlauf, Einstellungen, Wallbox, Strompreis, Personen,
                               Ladeverlauf, Teilen, Import, Info, Kiosk
devices.html                   nur Entwicklung: App in Handy-/Tablet-/Laptop-Größe nebeneinander
scripts/publish.sh             Kopie ohne private Dateien in ein eigenes Git-Repo (z. B. für GitHub)
docs/DESIGN.md                 Design-Regeln und Tokens
docs/DATA.md                   Alle gespeicherten Daten, Formate, Rechenwege, Verhalten V1 → V2
CHANGELOG.md                   Änderungen pro Version
```

Stack: React 18, react-router 6, Tailwind 3 (Farben als CSS-Variablen), Heroicons 2, Vite 5, Vitest, `qrcode`.
Keine externen Requests außer zum eigenen Server (CSP `default-src 'self'`). Keine Fonts von außen.

## Befehle

```sh
npm run dev -- --host     # http://localhost:5173, auch im WLAN; /api geht an devApiTarget aus site.config.js
npm test                  # Unit-Tests
npm run build             # nach dist/ – dist/ und server/ zusammen auf einen PHP-Webspace (Apache) laden
```

## Testen (vor jedem Deploy)

1. `npm test` – alles grün (Abrechnung = V1, Ladevorgänge/Personen/Vorschläge, Datenschicht, Teilen, Sicherung).
2. `npm run dev`, im Browser die Konsole öffnen und V1-Daten einspielen (`v1Storage` in
   `src/lib/__tests__/fixtures.js`). Die go-e-Antwort lässt sich durch Überschreiben von `window.fetch`
   simulieren (`/api/status.php` mit `dll`, `/api/history.php` mit `{ data: [...] }` im go-e-Format,
   gern jede dritte Antwort mit Status 500); danach in der App auf Aktualisieren tippen.
   Ohne `wall_e_welcome` erscheint der Willkommens-Bildschirm wie beim ersten Start von V2.
3. Prüfen: Willkommen + automatische Sicherung, Live, Abrechnung (Beträge wie vorher), Abrechnung
   abschließen, Verlauf (Ladevorgänge zuordnen, einzeln, mehrere, Vorschläge), Personen (Profil,
   Ladeleistung, „Das bin ich“, Personen-Auswahl), Löschen (Startwert wird zurückgesetzt), Strompreis,
   Teilen → Link → auf leerem Speicher importieren → Rückgängig, einzelne 500er ohne Fehlermeldung.
4. `/devices.html` für Handy, iPhone SE, iPad und Laptop ansehen.

## go-e Schnittstellen

- **Status:** `https://<serial>.api.v3.go-e.io/api/status?token=…` (Cloud-API v3) über `api/status.php`.
  Wichtige Felder: `car`, `nrg`, `wh`, `eto`, `amp`, `ama`, `psm`, `tma`, `lrc`, `cards[{name, energy (Wh)}]`,
  `dll` (Export-Link für den Ladeverlauf). Die Cloud antwortet gelegentlich kurz mit 500 → Proxy wiederholt
  einmal, die App wiederholt still mit Backoff und zeigt Fehler erst nach zwei Fehlversuchen.
- **Ladeverlauf:** `https://data.v3.go-e.io/api/v1/direct_json?e=<Schlüssel>[&from=ms&to=ms&timezone=…]`
  (dieselbe Quelle wie die go-e Export-Webseite `data.v3.go-e.io/export?e=…`). Liefert
  `{ columns, data: [{ session_identifier, session_number, id_chip, id_chip_name, startUnix, endUnix,
  energy (kWh), seconds_charged, max_power, eto_start, eto_end, … }] }`. Ladungen ohne Karte haben
  `id_chip_name: ''`. Zeiten als Text sind UTC – immer `startUnix`/`endUnix` benutzen. Kein CORS → nur über
  `api/history.php`. Keine Obergrenze bei der Anzahl beobachtet.

## Geschichte

- **V1 (bis 1.3.0):** Create-React-App. Quellcode wurde aus den Source-Maps rekonstruiert, auf Vite umgestellt
  und abgesichert (Proxy nur per POST, Seriennummer streng geprüft, CSP/HSTS, alte Service Worker abgemeldet).
- **V2 (2.0.0):** komplette Neugestaltung, mobil zuerst, siehe `CHANGELOG.md`. Daten bleiben im V1-Format.
  Entfallen: Seiten „Sessions“ und „go-e Login“ (funktionierten nicht) und das Anlegen neuer „Snapshots“
  (jetzt: Teilen & Sichern). Alte Snapshots bleiben im Verlauf unter „Alte Sicherungen“ sichtbar.

## Offene Punkte

- Personenfarben richten sich nach der Reihenfolge (Profile zuerst, dann Karten). Legt man ein Profil an,
  können Farben wechseln – evtl. später feste Farbe pro Profil speichern.
- Ein gerade laufender Ladevorgang steht erst nach dem Ende im go-e Verlauf; bis dahin fehlt er in der
  Abrechnung nach Ladevorgängen (der Hauszähler enthält ihn schon).
