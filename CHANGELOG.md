# Changelog

## 2.0.0 (in Arbeit)

Komplett neu gestaltet – mobil zuerst. Alle Daten aus Version 1 bleiben erhalten, die App muss nicht neu installiert werden.

- Neue Navigation: Live, Abrechnung, Verlauf, Einstellungen (Tab-Leiste unten, am Laptop Seitenleiste).
- Live: große Ladeleistung, aktuelle Ladung mit Kosten, laufende Abrechnung auf einen Blick, Werte pro Phase einklappbar.
- Abrechnung: Kosten pro Person mit Farbbalken, Zählerstand per Sheet eintragen, Abrechnung abschließen mit Vorschau.
- Genauer: ab dem ersten Abschluss wird der echte Verbrauch pro Karte gerechnet (statt Gesamtanteil); Startwert nach dem Abschließen korrigiert.
- Verlauf: abgeschlossene Abrechnungen mit Details, Bearbeiten und Löschen; alte Snapshots als „Alte Sicherungen“.
- Neu: Teilen & Sichern – Wallbox-Zugang, Strompreise, Abrechnungen und Design per Link, QR-Code oder Datei weitergeben; Import mit Vorschau und Rückgängig.
- Neu: Name für die Wallbox, Design „Automatisch“ (folgt dem System), „Als App installieren“.
- Kiosk-Ansicht neu: große Anzeige, Bildschirm bleibt an.
- Neu: Personen – Profile mit einer oder mehreren RFID-Karten, „Das bin ich“ pro Gerät, Personen-Auswahl auf Live, Abrechnung und Verlauf.
- Neu: Ladevorgänge aus dem go-e Ladeverlauf (auch ohne RFID-Karte), einzeln oder mehrere auf einmal einer Person zuordnen.
- Abrechnung nach Ladevorgängen; Ladungen ohne Zuordnung als eigene Zeile oder anteilig verteilt (umschaltbar). Ohne Ladeverlauf wie bisher über die Kartenstände.
- Ladevorgänge zeigen Dauer, Ø- und Spitzenleistung. Profile können die Ladeleistung des Autos angeben (sonst gelernt); Ladungen ohne Karte bekommen einen Zuordnungs-Vorschlag, einzeln oder alle auf einmal übernehmbar.
- Ladevorgang im Detail: Beginn als Titel, Balken „Geladen / Standzeit“ in Stunden und Prozent, Ø-Leistung nur über die reine Ladezeit; Texte werden nie abgeschnitten.
- Vorschläge in der Farbe der jeweiligen Person. Verlauf ohne Filter-Schalter: alle Monate, mit gewählter Person ihre und die offenen Ladevorgänge; offene stehen oben gesammelt mit „Übernehmen“ – wahlweise alle Vorschläge oder nur die einer Person, mit vollständiger Liste zur Bestätigung.
- Stabilere Verbindung: kurze Fehler der go-e Cloud (z. B. „Fehler 500“) werden still wiederholt, der letzte Stand bleibt sichtbar.
- Willkommens-Bildschirm beim ersten Start mit automatischer Sicherung des bisherigen Stands (wiederherstellbar) und Sicherungsdatei.
- Komma in Zahlenfeldern, deutsche Zahlenformate, keine Browser-Popups mehr.
- Entfernt: Seiten „Sessions“ und „go-e Login“ (funktionierten nicht), Anlegen neuer Snapshots. Alte Adressen leiten weiter.

## 1.3.0 (12.10.2026)

Quellcode wiederhergestellt, Build auf Vite, sicherer PHP-Proxy, Demo-Modus, deutsche Navigation.
