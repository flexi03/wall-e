import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { LinkIcon, QrCodeIcon, DocumentArrowDownIcon, ExclamationTriangleIcon, ArrowDownTrayIcon, ClipboardDocumentIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { Page, Section, Card, List, ListItem, Button, Banner, Checkbox, Sheet, ConfirmSheet, useToast } from '../components/ui.jsx';
import * as store from '../lib/storage.js';
import { formatDate } from '../lib/format.js';
import { useStored } from '../hooks/data.js';
import { SECTIONS, availableSections, buildPayload, buildLink, saveFile } from '../lib/share.js';

// QR-Codes sind bis ca. 2,3 KB Text zuverlässig mit Handykameras lesbar
const QR_LIMIT = 2300;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SharePage() {
  const toast = useToast();
  const available = useStored(availableSections);
  const [selected, setSelected] = useState(() => available.filter((s) => s !== 'settings'));
  const [link, setLink] = useState('');
  const [qr, setQr] = useState(null); // { svg } | { tooLarge }
  const [qrOpen, setQrOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const localBackup = useStored(store.getLocalBackup);

  const payload = useMemo(() => buildPayload(selected), [selected]);
  const nothing = selected.length === 0;

  // Link (und QR-Code) neu erzeugen, sobald sich die Auswahl ändert
  useEffect(() => {
    let cancelled = false;
    setLink('');
    setQr(null);
    if (nothing) return undefined;
    buildLink(payload).then(async (url) => {
      if (cancelled) return;
      setLink(url);
      if (url.length > QR_LIMIT) {
        setQr({ tooLarge: true });
      } else {
        const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'L', margin: 2, color: { dark: '#10141c', light: '#ffffff' } });
        if (!cancelled) setQr({ src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [payload, nothing]);

  const toggle = (section) => (checked) => setSelected((s) => (checked ? [...s, section] : s.filter((x) => x !== section)));

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Wall-E', text: 'Meine Wall-E-Einstellungen', url: link });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    toast((await copyText(link)) ? 'Link kopiert' : 'Kopieren nicht möglich', 'success');
  };

  const shareFile = async () => {
    if (await saveFile(payload)) toast('Sicherung erstellt');
  };

  return (
    <Page title="Teilen & Sichern" back={{ to: '/einstellungen', label: 'Einstellungen' }}>
      <Section title="Was soll mit?" footer="Die Daten stecken direkt im Link bzw. in der Datei. Sie werden nicht auf einem Server gespeichert.">
        {available.length === 0 ? (
          <Card>
            <p className="text-body text-muted">Noch nichts zum Teilen – verbinde zuerst eine Wallbox oder lege einen Strompreis an.</p>
          </Card>
        ) : (
          <List>
            {available.map((s) => (
              <Checkbox key={s} checked={selected.includes(s)} onChange={toggle(s)} title={SECTIONS[s].label} subtitle={SECTIONS[s].hint} />
            ))}
          </List>
        )}
      </Section>

      {selected.includes('wallbox') && (
        <Banner tone="warning" icon={ExclamationTriangleIcon} title="Enthält deinen API-Token">
          Wer den Link oder die Datei hat, kann deine Wallbox abfragen. Nur an Personen oder Geräte weitergeben, denen du vertraust.
        </Banner>
      )}

      <Section title="Weitergeben">
        <List>
          <ListItem icon={LinkIcon} title="Link teilen" subtitle="Per Nachricht, Mail oder AirDrop" onClick={nothing || !link ? undefined : shareLink} />
          <ListItem icon={QrCodeIcon} title="QR-Code zeigen" subtitle="Mit dem anderen Handy scannen" onClick={nothing || !qr ? undefined : () => setQrOpen(true)} />
          <ListItem icon={DocumentArrowDownIcon} title="Als Datei sichern" subtitle="Backup zum Aufheben oder Weitergeben" onClick={nothing ? undefined : shareFile} />
        </List>
      </Section>

      <Section title="Empfangen">
        <List>
          <ListItem icon={ArrowDownTrayIcon} title="Daten übernehmen" subtitle="Link einfügen oder Datei öffnen" to="/import" />
        </List>
      </Section>

      {localBackup && (
        <Section title="Automatische Sicherung" footer="Beim ersten Start von Wall-E 2 wurde dein damaliger Stand auf diesem Gerät gesichert.">
          <List>
            <ListItem icon={ArrowUturnLeftIcon} iconTone="warning" title="Stand vor Version 2 wiederherstellen" subtitle={`Gesichert am ${formatDate(localBackup.at, true)}`} onClick={() => setRestoreOpen(true)} />
          </List>
        </Section>
      )}

      <ConfirmSheet
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Stand vor Version 2 wiederherstellen?"
        confirmLabel="Wiederherstellen"
        danger
        onConfirm={() => {
          store.restoreLocalBackup();
          toast('Stand vor Version 2 wiederhergestellt');
        }}
      >
        Wallbox-Zugang, Strompreise und Abrechnungen bekommen wieder den Stand vom {localBackup ? formatDate(localBackup.at, true) : ''}. Später abgeschlossene Abrechnungen gehen dabei verloren – sichere sie vorher als Datei.
      </ConfirmSheet>

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="QR-Code">
        {qr && qr.src && (
          <div className="flex flex-col items-center">
            <img src={qr.src} alt="QR-Code mit den ausgewählten Wall-E-Daten" className="aspect-square w-full max-w-[18rem] rounded-card bg-white p-2" />
            <p className="mt-4 text-center text-body text-muted">Mit der Kamera des anderen Handys scannen und den Link öffnen.</p>
            <p className="mt-2 text-center text-caption text-muted">iPhone mit installierter App: Link in Safari öffnen, „Link kopieren“ tippen und in der App unter Einstellungen → Daten übernehmen einfügen.</p>
          </div>
        )}
        {qr && qr.tooLarge && (
          <div className="space-y-4">
            <p className="text-body text-muted">Für einen QR-Code sind es zu viele Daten (z. B. viele Abrechnungen). Nimm den Link oder die Datei – oder wähle oben weniger aus.</p>
            <Button block variant="plain" icon={ClipboardDocumentIcon} onClick={async () => toast((await copyText(link)) ? 'Link kopiert' : 'Kopieren nicht möglich')}>
              Link kopieren
            </Button>
          </div>
        )}
      </Sheet>
    </Page>
  );
}
