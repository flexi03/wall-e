# Wall-E Design

Ruhig, klar, mobil zuerst – wie eine native iOS/Android-App. Eine Hauptzahl pro Bildschirm, alles andere
in gruppierten Listen. Jede Seite besteht nur aus den Bausteinen in `src/components/ui.jsx`.

## Grundsätze

1. **Mobil zuerst.** Ausgelegt für 375–430 px Breite. Tablet: gleiche Spalte, etwas breiter.
   Laptop (≥ 1024 px): Seitenleiste statt Tab-Leiste, Inhalt max. 896 px.
2. **Eine Hauptzahl.** Jede Hauptseite hat genau eine große Zahl (`text-display`): Live = Leistung,
   Abrechnung = Kosten, Strompreis = Preis.
3. **Daumen-tauglich.** Tippflächen mindestens 44 px hoch (`min-h-11`), Hauptaktion als breiter Button.
4. **Formulare in Sheets.** Eingaben öffnen sich von unten (`Sheet`), ab Tablet als Dialog. Kein `alert`/`confirm`.
5. **Zerstörerisches immer bestätigen** (`ConfirmSheet`, Ton `danger`), Rückmeldung per `useToast`.
6. **Deutsch, Du, kurz.** Zahlen deutsch formatiert (`src/lib/format.js`), Zahlenfelder akzeptieren Komma.
7. **Keine Emojis** in der Oberfläche, nur Heroicons (24 outline; solid für aktive Tabs).

## Tokens

Farben nur über Tailwind-Namen, die auf CSS-Variablen zeigen (`src/index.css`, hell + `.dark`):

| Token | Verwendung |
|---|---|
| `bg` | Seitenhintergrund |
| `surface` | Karten, Sheets, Leisten |
| `surface-2` | Flächen in Karten, Hover, Segmented-Hintergrund |
| `line` | Rahmen und Trennlinien |
| `ink` / `muted` / `subtle` | Text: Haupt / Neben / sehr leise |
| `primary` (+ `-soft`) | Aktionen, aktive Navigation, Links |
| `success` | lädt, aktiv, positiv |
| `warning` | Demo, pauschaler Ladeverlust, Hinweise |
| `danger` | Fehler, Löschen |
| `person-1 … 6` | feste Farbe je Person (Reihenfolge: Profile, dann Karten), über `PersonDot`/`SplitBar` |
| `subtle` (Punkt) | „Nicht zugeordnet“; gestrichelter `warning`-Kreis = Ladevorgang ohne Zuordnung |

Schrift: System-Schrift (SF auf Apple). Stufen – **nur diese** verwenden:

| Klasse | Größe | Verwendung |
|---|---|---|
| `text-display` | 44 px bold | die eine Hauptzahl |
| `text-title` | 28 px bold | Seitentitel |
| `text-headline` | 17 px semibold | Werte, Kartentitel, Sheet-Titel |
| `text-body` | 15 px | Fließtext, Listen, Buttons |
| `text-caption` | 13 px | Beschriftungen, Abschnittstitel, Hinweise |
| `text-micro` | 12 px | nur Tab-Leiste |

Zahlen immer mit `tabular` (gleich breite Ziffern).

Radien: `rounded-card` (20 px) für Karten/Listen, `rounded-control` (14 px) für Buttons/Felder,
`rounded-full` für Badges. Abstände: Seite `px-4` (md `px-6`, lg `px-8`), zwischen Abschnitten `space-y-6`,
Karteninnen `p-4 sm:p-5`.

## Bausteine (`ui.jsx`)

- `Page` (Titel, Untertitel, Aktion rechts, optional Zurück-Link) → `Section` (kleiner Titel + Fußnote)
- `Card`, `List` + `ListItem` (Icon, Titel, Untertitel, Wert, Chevron; als Link/Button)
- `Button` (`primary` | `secondary` | `plain` | `ghost` | `danger`; `sm` | `md` | `lg`; `block`), `IconButton`
- `Badge`, `Banner`, `Stat`, `EmptyState`, `Skeleton`, `Spinner`
- `TextField`, `NumberField` (Komma-Tastatur, Einheit rechts), `Segmented`, `Checkbox`
- `Sheet`, `ConfirmSheet`, `ToastProvider`/`useToast`
- `PersonDot`, `SplitBar` (`colors`: Farbindex je Zeile, `null` = grau; `highlight`: eine Zeile betonen)
- `Chip` (Filter zum An-/Ausschalten, gedrückt mit ×)
- `PersonBadge` (Etikett in der Farbe einer Person, z. B. Vorschlag „Name?“), `SplitLegend` (zwei Anteile als Balken mit Stunden und %, z. B. Geladen/Standzeit)
- `Stat` kürzt nie ab – Werte und Hinweise brechen um, damit in Sheets alles lesbar ist
- `PersonPicker` (`components/PersonPicker.jsx`): Pille „Alle ▾“ / „Name ▾“ rechts im Seitenkopf von Live,
  Abrechnung und Verlauf. Ist eine Person gewählt, wird **ihr** Wert zur Hauptzahl, andere Zeilen werden blasser.

Neue Muster zuerst hier ergänzen, dann benutzen – keine Einzel-Stile in Seiten.

## Seitenaufbau

| Seite | Inhalt |
|---|---|
| Live `/` | Status-Badge, Leistung (Hauptzahl), diese Ladung + Karte, laufende Abrechnung, Wallbox-Werte, RFID-Karten |
| Abrechnung `/abrechnung` | Kosten bisher (Hauptzahl), Aufteilung, „Abrechnung abschließen“, Hauszähler, Rechenweg |
| Verlauf `/verlauf` | Umschalter Ladevorgänge/Abrechnungen. Ladevorgänge nach Monat (alle Monate); ohne Person alle, mit Person „ihre + offene“ – kein weiterer Filter; oben eine Karte „n ohne Zuordnung · Übernehmen“ → Sheet: Auswahl „Alle“ oder eine Person (vorausgewählt: aktuelle Ansicht), Liste aller betroffenen Ladevorgänge (vollständig), Bestätigen; Aktualisieren oben rechts; „Mehrere zuordnen“; Detail-Sheet mit Titel = Beginn, Geladen/Standzeit-Balken; Abrechnungen mit Detail-Sheet, alte Sicherungen |
| Einstellungen `/einstellungen` | Wallbox, Strompreis, Personen, Ladeverlauf, Teilen & Sichern, Daten übernehmen, Design, Kiosk, Hilfe, Alles löschen |
| Willkommen (Overlay) | einmalig beim ersten Start von V2: Logo, 3 Neuerungen, Hinweis auf Sicherung, „Los geht’s“ |
| Kiosk `/kiosk` | immer dunkel, sehr große Schrift, Bildschirm bleibt an, ohne Navigation |
