import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowPathIcon, ArrowsRightLeftIcon, ArrowUpTrayIcon, BellIcon, ClipboardDocumentIcon, DevicePhoneMobileIcon, LinkIcon, LockClosedIcon, UserIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { Page, Section, Card, List, ListItem, Button, Banner, Badge, Checkbox, ConfirmSheet, Sheet, TextField, Spinner, useToast } from '../components/ui.jsx';
import { useStatus, useStored } from '../hooks/data.js';
import { useSync } from '../hooks/sync.js';
import * as store from '../lib/storage.js';
import { startSync, leaveSync, enablePush, disablePush, pushSupport, joinWithKey, listDevices, groupDevices, removeDevice, sendSnapshot } from '../lib/sync.js';
import { buildLink, buildPayload, readLinkOrCode } from '../lib/share.js';
import { myName } from '../lib/syncText.js';
import { isIos, isStandalone } from '../lib/install.js';
import { formatRelative } from '../lib/format.js';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Explainer() {
  return (
    <Card>
      <div className="flex gap-3">
        <LockClosedIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-2 text-body text-muted">
          <p>Trägt jemand einen Zählerstand ein, ordnet eine Ladung zu, ändert Personen oder Preise oder schließt eine Abrechnung ab, sehen das die anderen Handys – mit Namen, z. B. „Alex hat den Zählerstand eingetragen“.</p>
          <p>Alles wird auf dem Handy verschlüsselt. Der Server sieht nur Zeichensalat und löscht jede Änderung, sobald alle anderen Geräte sie übernommen oder abgelehnt haben (spätestens nach 30 Tagen).</p>
        </div>
      </div>
    </Card>
  );
}

// Einladung annehmen: Link oder Code einfügen (für die installierte App auf dem iPhone, die Links nicht selbst öffnet)
function JoinCard({ onJoined }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const join = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = await readLinkOrCode(text);
      if (!payload.data || !payload.data.sync) throw new Error('Das ist keine Einladung zu „Gemeinsam nutzen“.');
      await joinWithKey(payload.data.sync.key);
      onJoined();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <TextField multiline value={text} onChange={(e) => setText(e.target.value)} placeholder="Einladungs-Link hier einfügen" aria-label="Einladungs-Link" error={error} />
      <Button className="mt-3" block disabled={!text.trim()} loading={busy} onClick={join}>
        Beitreten
      </Button>
      <p className="mt-2 text-caption text-muted">Deine Daten auf diesem Gerät bleiben, wie sie sind.</p>
    </Card>
  );
}

function InviteSheet({ open, onClose }) {
  const toast = useToast();
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    buildLink(buildPayload(['sync'])).then(async (url) => {
      if (cancelled) return;
      setLink(url);
      const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#10141c', light: '#ffffff' } });
      if (!cancelled) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Wall-E', text: 'Einladung zu Wall-E „Gemeinsam nutzen“', url: link });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    toast((await copyText(link)) ? 'Link kopiert' : 'Kopieren nicht möglich');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Jemanden einladen">
      <div className="space-y-4">
        <div className="mx-auto w-56 overflow-hidden rounded-card bg-white p-2">
          {qr ? <img src={qr} alt="QR-Code der Einladung" className="h-full w-full" /> : <div className="flex h-52 items-center justify-center text-primary"><Spinner className="h-7 w-7" /></div>}
        </div>
        <p className="text-center text-body text-muted">Mit der Kamera des anderen Handys scannen – oder den Link schicken.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={LinkIcon} disabled={!link} onClick={share}>
            Link teilen
          </Button>
          <Button variant="secondary" icon={ClipboardDocumentIcon} disabled={!link} onClick={async () => toast((await copyText(link)) ? 'Link kopiert' : 'Kopieren nicht möglich')}>
            Kopieren
          </Button>
        </div>
        <Card className="bg-surface-2">
          <p className="text-caption text-muted">
            Die Einladung enthält nur den Schlüssel für den Abgleich – keine Daten. Die Daten auf dem anderen Handy bleiben.
            <br />
            <span className="font-semibold text-ink">iPhone mit installierter App:</span> Link kopieren und in Wall-E unter Einstellungen → Gemeinsam nutzen → „Einladung einfügen“ einfügen (Safari und App speichern getrennt).
          </p>
        </Card>
        <p className="text-caption text-muted">Teile die Einladung nur mit Leuten, die mitrechnen sollen.</p>
      </div>
    </Sheet>
  );
}

// Personen mit ihren Geräten; andere Geräte lassen sich entfernen
function Devices({ onRemove, version }) {
  const [state, setState] = useState({ loading: true, error: '', groups: [] });
  const load = useCallback(async () => {
    try {
      setState({ loading: false, error: '', groups: groupDevices(await listDevices()) });
    } catch (e) {
      setState({ loading: false, error: e.message, groups: [] });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, version]);

  if (state.loading) return <Card><div className="flex justify-center py-2 text-primary"><Spinner className="h-6 w-6" /></div></Card>;
  if (state.error) return <Card><p className="text-body text-muted">{state.error}</p></Card>;
  return (
    <div className="space-y-3">
      {state.groups.map((group) => (
        <List key={group.key}>
          <div className="flex items-center gap-2 px-4 pt-3 text-body font-semibold text-ink">
            <UserIcon className="h-4 w-4 text-muted" aria-hidden="true" />
            {group.name}
            {group.mine && <Badge tone="primary">du</Badge>}
          </div>
          {group.devices.map((d) => (
            <ListItem
              key={d.id}
              icon={DevicePhoneMobileIcon}
              iconTone={d.mine ? 'primary' : 'neutral'}
              title={d.label}
              subtitle={d.mine ? 'Dieses Gerät' : `zuletzt aktiv ${formatRelative(new Date(d.seen).toISOString())}`}
              onClick={d.mine ? undefined : () => onRemove(d)}
              chevron={!d.mine}
            >
              {d.push && <BellIcon className="h-4 w-4 text-muted" aria-label="Benachrichtigungen an" />}
            </ListItem>
          ))}
        </List>
      ))}
    </div>
  );
}

export default function SyncPage() {
  const { demo } = useStatus();
  const sync = useSync();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(null); // 'invite' | 'leave' | 'snapshot' | { remove: device }
  const [version, setVersion] = useState(0);
  const config = sync.sync;
  const name = useStored(myName);
  const removedAt = useStored(store.getSyncRemoved);

  const act = (label, fn) => async () => {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  if (!config) {
    return (
      <Page title="Gemeinsam nutzen" back={{ to: '/einstellungen', label: 'Einstellungen' }}>
        {removedAt && (
          <Banner tone="warning" title="Dieses Gerät wurde entfernt" action={<Button size="sm" variant="plain" onClick={() => store.setSyncRemoved(null)}>OK</Button>}>
            Jemand aus der Gruppe hat dieses Gerät am {new Date(removedAt).toLocaleDateString('de-DE')} aus „Gemeinsam nutzen“ entfernt. Deine Daten auf dem Handy sind noch da. Für eine neue Einladung bitte nachfragen.
          </Banner>
        )}
        <Explainer />
        {error && <Banner tone="danger" title="Einrichten nicht möglich">{error}</Banner>}
        <Section title="Einladung einfügen" footer="Einladungs-Link von jemandem, der „Gemeinsam nutzen“ schon eingerichtet hat.">
          <JoinCard onJoined={() => toast('Beigetreten – Änderungen werden ab jetzt abgeglichen')} />
        </Section>
        <Section title="Als Erste:r einrichten" footer="Danach lädst du die anderen per Link oder QR-Code ein.">
          <Button size="lg" block icon={ArrowsRightLeftIcon} loading={busy === 'start'} disabled={demo} onClick={act('start', async () => {
            await startSync();
            toast('Gemeinsam nutzen ist eingerichtet');
          })}>
            Auf diesem Gerät einrichten
          </Button>
        </Section>
      </Page>
    );
  }

  const support = pushSupport();
  const iosBrowser = isIos() && !isStandalone();
  const pushHint =
    support === 'unsupported'
      ? iosBrowser
        ? 'Auf dem iPhone nur in der installierten App: in Safari Teilen → „Zum Home-Bildschirm“, dann dort einschalten.'
        : 'Dieser Browser kann keine Benachrichtigungen empfangen.'
      : support === 'denied'
        ? 'Benachrichtigungen sind für Wall-E blockiert. Das lässt sich in den Einstellungen des Handys bzw. Browsers ändern.'
        : 'Auch wenn die App geschlossen ist. Der Inhalt wird erst auf dem Handy entschlüsselt.';

  return (
    <Page title="Gemeinsam nutzen" back={{ to: '/einstellungen', label: 'Einstellungen' }}>
      {(error || sync.error) && (
        <Banner tone="warning" title="Abgleich gerade nicht möglich">
          {error || sync.error}
        </Banner>
      )}
      {name === 'Jemand' && (
        <Banner tone="primary" icon={UserIcon} title="Wer bist du?" action={<Button size="sm" variant="plain" to="/einstellungen/personen">Festlegen</Button>}>
          Leg unter Personen „Das bin ich“ fest – dann sehen die anderen deinen Namen bei deinen Änderungen.
        </Banner>
      )}

      <Section title="Personen & Geräte" action={<button type="button" className="min-h-8 text-caption font-semibold text-primary" onClick={() => setVersion((v) => v + 1)}>Aktualisieren</button>} footer="Gerät antippen, um es zu entfernen.">
        <Devices version={version} onRemove={(device) => setSheet({ remove: device })} />
      </Section>

      <Section>
        <List>
          <ListItem icon={UserPlusIcon} title="Jemanden einladen" subtitle="QR-Code oder Link – nur für den Abgleich" onClick={() => setSheet('invite')} />
          <ListItem icon={ArrowUpTrayIcon} iconTone="neutral" title="Meinen Stand an alle senden" subtitle="Abrechnungen, Personen, Zuordnungen, Preise – die anderen werden gefragt" onClick={() => setSheet('snapshot')} />
          <ListItem icon={ArrowPathIcon} iconTone="neutral" title="Jetzt abgleichen" subtitle={sync.at ? `zuletzt ${formatRelative(sync.at)}` : undefined} onClick={sync.busy ? undefined : sync.refresh} chevron={false} />
        </List>
      </Section>

      <Section title="Änderungen der anderen" footer={config.auto ? 'Änderungen werden sofort übernommen; du siehst kurz einen Hinweis. Ein kompletter Stand wird immer erst nachgefragt.' : 'Jede Änderung erscheint oben mit „Übernehmen“ und „Ablehnen“.'}>
        <List>
          <Checkbox checked={!!config.auto} onChange={(v) => store.updateSync({ auto: v })} title="Automatisch übernehmen" subtitle="Aus: erst fragen" />
        </List>
      </Section>

      <Section title="Benachrichtigungen" footer={pushHint}>
        <List>
          <Checkbox
            checked={!!config.notify && support === 'granted'}
            disabled={support === 'unsupported' || support === 'denied' || busy === 'push'}
            onChange={(on) =>
              act('push', async () => {
                if (on) {
                  await enablePush();
                  toast('Benachrichtigungen sind an');
                } else {
                  await disablePush();
                  toast('Benachrichtigungen sind aus');
                }
                setVersion((v) => v + 1);
              })()
            }
            title="Bei Änderungen benachrichtigen"
            subtitle="z. B. „Alex hat den Zählerstand eingetragen“"
          />
        </List>
      </Section>

      <Section footer="Dieses Gerät gleicht danach nicht mehr ab. Deine Daten auf dem Handy bleiben.">
        <List>
          <ListItem danger title="Gemeinsam nutzen beenden" onClick={() => setSheet('leave')} chevron={false} />
        </List>
      </Section>

      <InviteSheet open={sheet === 'invite'} onClose={() => setSheet(null)} />

      <ConfirmSheet
        open={sheet === 'snapshot'}
        onClose={() => setSheet(null)}
        title="Deinen Stand an alle senden?"
        confirmLabel="Senden"
        onConfirm={act('snapshot', async () => {
          await sendSnapshot();
          toast('Gesendet – die anderen werden gefragt');
        })}
      >
        Abrechnungen, Zählerstände, Personen, Zuordnungen und Strompreise dieses Geräts gehen an alle anderen. Jede:r entscheidet selbst, ob er oder sie sie übernimmt (lässt sich dort rückgängig machen).
      </ConfirmSheet>

      <ConfirmSheet
        open={!!(sheet && sheet.remove)}
        onClose={() => setSheet(null)}
        danger
        title="Gerät entfernen?"
        confirmLabel="Entfernen"
        onConfirm={act('remove', async () => {
          await removeDevice(sheet.remove.id);
          toast('Gerät entfernt');
          setVersion((v) => v + 1);
        })}
      >
        {sheet && sheet.remove ? `${sheet.remove.name} · ${sheet.remove.label} wird abgemeldet und bekommt keine Änderungen mehr. Die Daten auf dem Gerät selbst bleiben dort. Hinweis: Wer den Einladungs-Link noch hat, kann als neues Gerät wieder beitreten.` : ''}
      </ConfirmSheet>

      <ConfirmSheet
        open={sheet === 'leave'}
        onClose={() => setSheet(null)}
        danger
        title="Gemeinsam nutzen beenden?"
        confirmLabel="Beenden"
        onConfirm={act('leave', async () => {
          await leaveSync();
          toast('Gemeinsam nutzen beendet');
        })}
      >
        Dieses Gerät wird abgemeldet und bekommt keine Änderungen mehr. Die anderen Geräte gleichen weiter untereinander ab.
      </ConfirmSheet>
    </Page>
  );
}
