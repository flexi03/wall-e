import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowDownTrayIcon, DocumentArrowUpIcon, ExclamationTriangleIcon, ClipboardDocumentIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';
import { Page, Section, Card, List, Button, Banner, Checkbox, TextField, Spinner, useToast } from '../components/ui.jsx';
import * as store from '../lib/storage.js';
import { SECTIONS, describePayload, readLinkOrCode, readFile, applyPayload } from '../lib/share.js';
import { isStandalone, isIos } from '../lib/install.js';
import { formatDate } from '../lib/format.js';

// Was würde beim Import überschrieben?
function currentInfo(section) {
  switch (section) {
    case 'wallbox': {
      const w = store.getWallbox();
      return w.isConfigured ? `ersetzt ${w.name || w.serial}` : null;
    }
    case 'prices':
      return store.getPrice().isSet ? 'ersetzt deine Strompreise' : null;
    case 'billing': {
      const count = store.getPeriods().length;
      return count > 0 || store.getMeters().start !== null ? `ersetzt deine Abrechnungen (${count})` : null;
    }
    case 'people': {
      const count = store.getProfiles().length;
      return count > 0 ? `ersetzt deine Profile (${count})` : null;
    }
    default:
      return null;
  }
}

export default function ImportPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInput = useRef(null);
  const [payload, setPayload] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [fromLink, setFromLink] = useState('');

  const accept = (p) => {
    setPayload(p);
    setSelected(describePayload(p).map((i) => i.section));
    setError('');
  };

  // Link mit Daten im "#" geöffnet: einlesen und die Daten sofort aus der Adresszeile entfernen
  useEffect(() => {
    const hash = location.hash;
    if (!hash || hash.length < 3) return;
    const link = window.location.href;
    navigate(location.pathname, { replace: true });
    setBusy(true);
    readLinkOrCode(hash)
      .then((p) => {
        accept(p);
        setFromLink(link);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleText = async () => {
    setBusy(true);
    try {
      accept(await readLinkOrCode(text));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      accept(await readFile(file));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    applyPayload(payload, selected);
    toast('Daten übernommen');
    navigate('/');
  };

  // iPhone: Links öffnen in Safari, die installierte App hat aber einen eigenen Speicher
  const iosBrowser = fromLink && isIos() && !isStandalone();

  return (
    <Page title="Daten übernehmen" back={{ to: '/einstellungen/teilen', label: 'Teilen & Sichern' }}>
      {busy && (
        <div className="flex justify-center py-6 text-primary">
          <Spinner className="h-7 w-7" />
        </div>
      )}
      {error && (
        <Banner tone="danger" icon={ExclamationTriangleIcon} title="Konnte nicht gelesen werden">
          {error}
        </Banner>
      )}

      {payload ? (
        <>
          {iosBrowser && (
            <Banner
              tone="primary"
              icon={DevicePhoneMobileIcon}
              title="Wall-E als App installiert?"
              action={
                <Button size="sm" variant="plain" icon={ClipboardDocumentIcon} onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(fromLink);
                    toast('Link kopiert');
                  } catch {
                    toast('Kopieren nicht möglich', 'danger');
                  }
                }}>
                  Link kopieren
                </Button>
              }
            >
              Dann kopiere den Link und füge ihn in der App unter Einstellungen → Daten übernehmen ein. Safari und die App speichern getrennt.
            </Banner>
          )}
          <Section title={`Enthalten · erstellt ${formatDate(payload.createdAt, true)}`} footer="Ausgewählte Bereiche ersetzen die Daten auf diesem Gerät. Unter Einstellungen kannst du den Import rückgängig machen.">
            <List>
              {describePayload(payload).map((item) => {
                const info = currentInfo(item.section);
                return (
                  <Checkbox
                    key={item.section}
                    checked={selected.includes(item.section)}
                    onChange={(checked) => setSelected((s) => (checked ? [...s, item.section] : s.filter((x) => x !== item.section)))}
                    title={SECTIONS[item.section].label}
                    subtitle={[item.text, info].filter(Boolean).join(' · ')}
                  />
                );
              })}
            </List>
          </Section>
          <Button size="lg" block icon={ArrowDownTrayIcon} disabled={selected.length === 0} onClick={apply}>
            Übernehmen
          </Button>
          <Button variant="ghost" block onClick={() => setPayload(null)}>
            Andere Daten wählen
          </Button>
        </>
      ) : (
        !busy && (
          <>
            <Section title="Link oder Code einfügen">
              <Card>
                <TextField multiline value={text} onChange={(e) => setText(e.target.value)} placeholder={`${window.location.origin}/import#wall-e=1.…`} aria-label="Wall-E-Link" />
                <Button className="mt-3" block disabled={!text.trim()} onClick={handleText}>
                  Prüfen
                </Button>
              </Card>
            </Section>
            <Section title="Oder Sicherungsdatei">
              <List>
                <button type="button" onClick={() => fileInput.current.click()} className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2.5 text-left text-body text-primary transition-colors hover:bg-surface-2">
                  <DocumentArrowUpIcon className="h-5 w-5" aria-hidden="true" />
                  Datei auswählen (.json)
                </button>
              </List>
              <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
            </Section>
          </>
        )
      )}
    </Page>
  );
}
