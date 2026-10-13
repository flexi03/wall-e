import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, SignalIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Page, Section, Card, List, ListItem, Button, Banner, TextField, ConfirmSheet, useToast } from '../components/ui.jsx';
import { useStored } from '../hooks/data.js';
import * as store from '../lib/storage.js';
import { testConnection } from '../lib/goe.js';
import { formatKw } from '../lib/format.js';

const SERIAL_PATTERN = /^[A-Za-z0-9]{1,20}$/;

export default function WallboxPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const saved = useStored(store.getWallbox);
  const [form, setForm] = useState({ name: saved.name, serial: saved.serial, token: saved.token });
  const [showToken, setShowToken] = useState(false);
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setTest(null);
  };
  const serial = form.serial.trim();
  const serialError = serial && !SERIAL_PATTERN.test(serial) ? 'Nur Buchstaben und Ziffern, ohne Leerzeichen' : '';
  const complete = serial && !serialError && form.token.trim();
  const changed = form.name.trim() !== saved.name || serial !== saved.serial || form.token.trim() !== saved.token;

  const runTest = async () => {
    setTesting(true);
    const result = await testConnection({ serial, token: form.token });
    setTest(result);
    setTesting(false);
    return result;
  };

  const persist = () => {
    store.saveWallbox({ serial, token: form.token, name: form.name });
    toast('Wallbox gespeichert');
    navigate('/');
  };

  // Vor dem Speichern testen; schlägt der Test fehl, kann trotzdem gespeichert werden (z. B. Wallbox gerade offline)
  const save = async () => {
    const result = test || (await runTest());
    if (result.success) persist();
  };

  return (
    <Page title="Wallbox" back={{ to: '/einstellungen', label: 'Einstellungen' }}>
      <Card>
        <div className="space-y-4">
          <TextField label="Name (optional)" value={form.name} onChange={set('name')} placeholder="z. B. Garage" autoComplete="off" />
          <TextField label="Seriennummer" value={form.serial} onChange={set('serial')} placeholder="z. B. 123456" inputMode="numeric" autoComplete="off" autoCapitalize="off" spellCheck="false" error={serialError} />
          <div className="relative">
            <TextField
              label="Cloud-API-Token"
              value={form.token}
              onChange={set('token')}
              type={showToken ? 'text' : 'password'}
              placeholder="aus der go-e App"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              className="pr-14"
            />
            <button
              type="button"
              onClick={() => setShowToken((s) => !s)}
              aria-label={showToken ? 'Token verbergen' : 'Token anzeigen'}
              className="absolute bottom-0 right-1 flex h-12 w-12 items-center justify-center text-muted"
            >
              {showToken ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </Card>

      {test && test.success && (
        <Banner tone="success" icon={CheckCircleIcon} title="Verbindung steht">
          {test.status.state.label} · {formatKw(test.status.powerW)}
        </Banner>
      )}
      {test && !test.success && (
        <Banner
          tone="danger"
          icon={ExclamationTriangleIcon}
          title="Keine Verbindung"
          action={complete && <Button size="sm" variant="plain" onClick={persist}>Trotzdem speichern</Button>}
        >
          {test.error}
        </Banner>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button size="lg" block disabled={!complete || (!changed && saved.isConfigured)} loading={testing && !test} onClick={save} className="sm:w-auto sm:flex-1">
          {saved.isConfigured ? 'Speichern' : 'Verbinden'}
        </Button>
        <Button size="lg" variant="plain" icon={SignalIcon} block disabled={!complete || testing} onClick={runTest} className="sm:w-auto sm:flex-1">
          Verbindung testen
        </Button>
      </div>

      <Section title="So findest du die Daten">
        <Card>
          <ol className="list-decimal space-y-2 pl-5 text-body text-ink">
            <li>Öffne die <strong>go-e App</strong> und wähle deine Wallbox.</li>
            <li>Gehe zu <strong>Internet → Erweiterte Einstellungen</strong>.</li>
            <li>Schalte <strong>Cloud-API</strong> ein und kopiere den <strong>API-Token</strong>.</li>
            <li>Die <strong>Seriennummer</strong> steht in der App und auf dem Gerät.</li>
          </ol>
          <p className="mt-3 text-caption text-muted">Benötigt go-e Firmware 052 oder neuer. Der Token bleibt auf diesem Gerät und wird nur für Abfragen an go-e weitergereicht.</p>
        </Card>
      </Section>

      {saved.isConfigured && (
        <Section>
          <List>
            <ListItem icon={TrashIcon} danger title="Zugang entfernen" onClick={() => setConfirmRemove(true)} chevron={false} />
          </List>
        </Section>
      )}

      <ConfirmSheet
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Zugang entfernen?"
        confirmLabel="Entfernen"
        danger
        onConfirm={() => {
          store.clearWallbox();
          setForm({ name: saved.name, serial: '', token: '' });
          toast('Zugang entfernt');
        }}
      >
        Seriennummer und Token werden von diesem Gerät gelöscht. Abrechnungen und Strompreise bleiben erhalten.
      </ConfirmSheet>
    </Page>
  );
}
