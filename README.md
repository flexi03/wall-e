# Wall-E

Eine kleine Web-App für die **go-e Wallbox**: Live-Status, alle Ladevorgänge und eine faire Aufteilung der
Stromkosten auf mehrere Personen – fürs Handy gebaut, installierbar als App, ohne Konto und ohne Datenbank.

## Was Wall-E kann

- **Live:** Ladeleistung, aktuelle Ladung mit Kosten, Werte pro Phase, RFID-Karten.
- **Ladevorgänge:** kompletter Verlauf aus dem go-e Export, mit Dauer, Ø- und Spitzenleistung –
  auch Ladungen **ohne RFID-Karte**.
- **Personen:** Profile mit einer oder mehreren Karten. Ladungen ohne Karte lassen sich zuordnen;
  Wall-E schlägt anhand der typischen Ladeleistung (z. B. einphasig 3,7 kW vs. dreiphasig 11 kW) die passende Person vor.
- **Abrechnung:** Kosten pro Person seit dem letzten Abschluss, mit echtem Ladeverlust aus dem Hauszähler
  (oder pauschal 1,8 %). Abgeschlossene Abrechnungen bleiben im Verlauf.
- **Teilen & Sichern:** Einstellungen per Link, QR-Code oder Datei auf ein anderes Gerät bringen –
  die Daten stecken nur im Link bzw. in der Datei.
- Hell/Dunkel, Kiosk-Ansicht fürs Wand-Tablet, deutsche Oberfläche.

## Wie es funktioniert

```
Browser (React-App, Daten im localStorage)
   │  POST /api/status.php  { serial, token }       → go-e Cloud-API v3 (Live-Status)
   │  POST /api/history.php { link, from, to }      → go-e Export (Ladeverlauf)
   ▼
PHP-Proxy auf deinem Webspace (nötig, weil go-e kein CORS erlaubt; speichert nichts)
```

Seriennummer und Token gehen nur im Anfrage-Inhalt an den Proxy, nie in der URL. Der Proxy akzeptiert nur
Seriennummern aus Buchstaben/Ziffern und nur Ziele bei go-e.

## Voraussetzungen

- go-e Charger mit Firmware 052+ und eingeschalteter **Cloud-API** (go-e App → Internet → Erweiterte Einstellungen → API-Token)
- Webspace mit **PHP 8** (cURL) und **Apache** (`.htaccess`), HTTPS
- Node.js 20+ zum Bauen

## Loslegen

```sh
npm install
cp site.config.example.js site.config.js   # optional: Kontakt/Impressum, Dev-Proxy eintragen
npm run dev                                 # http://localhost:5173
npm test
npm run build
```

Für die lokale Entwicklung braucht die App einen erreichbaren PHP-Proxy: Trag in `site.config.js` bei
`devApiTarget` die Adresse deiner Installation ein, dann leitet Vite `/api` dorthin weiter.
Ohne Proxy kannst du alles im **Demo-Modus** ausprobieren.

## Installieren

Lade den Inhalt von `dist/` und `server/` zusammen in das Wurzelverzeichnis einer (Sub-)Domain:

```
/index.html, /assets/…, /manifest.json, /.htaccess   ← aus dist/
/api/status.php, /api/test.php, /api/history.php, /api/goe.php, /api/.htaccess   ← aus server/
```

Danach die Seite auf dem Handy öffnen, Seriennummer und API-Token eintragen und über „Teilen → Zum Home-Bildschirm“
(iOS) bzw. „App installieren“ (Android/Chrome) installieren.

## Projekt

- `AGENT.md` – Aufbau, Regeln, Testen (auch für KI-Agents)
- `docs/DESIGN.md` – Design-System und Bausteine
- `docs/DATA.md` – gespeicherte Daten, Rechenwege, Teilen-Format
- `CHANGELOG.md`

Wall-E ist nicht mit go-e verbunden; „go-e“ ist eine Marke der go-e GmbH.
