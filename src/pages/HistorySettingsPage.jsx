import React, { useState } from 'react';
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Page, Section, Card, List, ListItem, Button, Banner, TextField, ConfirmSheet, useToast } from '../components/ui.jsx';
import { useHistory, useStatus, useStored } from '../hooks/data.js';
import * as store from '../lib/storage.js';
import { formatRelative } from '../lib/format.js';

export default function HistorySettingsPage() {
  const toast = useToast();
  const { status } = useStatus();
  const history = useHistory();
  const manual = useStored(() => store.getRaw(store.KEYS.historyLink) || '');
  const [link, setLink] = useState(manual);
  const [confirmReset, setConfirmReset] = useState(false);
  const fromWallbox = !!(status && status.historyLink);
  const linkValid = !link || /^https:\/\/data\.v3\.go-e\.io\/export\?e=[A-Za-z0-9_-]{20,}/.test(link.trim());

  return (
    <Page title="Ladeverlauf" back={{ to: '/einstellungen', label: 'Einstellungen' }}>
      {history.error ? (
        <Banner tone="danger" icon={ExclamationTriangleIcon} title="Nicht abrufbar">
          {history.error}
        </Banner>
      ) : history.available ? (
        <Banner tone="success" icon={CheckCircleIcon} title={`${history.sessions.length} Ladevorgänge geladen`}>
          {history.syncedAt ? `Aktualisiert ${formatRelative(history.syncedAt)}.` : ''} Neue Ladevorgänge kommen automatisch dazu.
        </Banner>
      ) : null}

      <Section title="Quelle" footer="Wall-E liest die einzelnen Ladevorgänge aus dem go-e Ladeverlauf (Export). Der Link enthält einen Lese-Schlüssel – er wird nur über den Wall-E-Server an go-e weitergereicht.">
        <List>
          <ListItem title="Export-Link der Wallbox" value={fromWallbox ? 'automatisch' : manual ? 'von Hand' : 'fehlt'} />
          <ListItem title="Jetzt aktualisieren" onClick={() => history.sync(true)} chevron={false}>
            <ArrowPathIcon className={`h-5 w-5 text-primary ${history.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </ListItem>
        </List>
      </Section>

      {!fromWallbox && (
        <Section title="Link von Hand eintragen" footer="In der go-e App: Ladevorgänge → Exportieren → Link kopieren. Er beginnt mit https://data.v3.go-e.io/export?e=">
          <Card>
            <TextField value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://data.v3.go-e.io/export?e=…" autoCapitalize="off" spellCheck="false" error={!linkValid ? 'Das ist kein go-e Export-Link' : ''} aria-label="Export-Link" />
            <Button
              className="mt-3"
              block
              disabled={!linkValid || link.trim() === manual}
              onClick={() => {
                store.setHistoryLink(link.trim());
                toast('Link gespeichert');
              }}
            >
              Speichern
            </Button>
          </Card>
        </Section>
      )}

      <Section footer="Löscht nur den Zwischenspeicher auf diesem Gerät; Zuordnungen bleiben erhalten. Danach wird alles neu von go-e geladen.">
        <List>
          <ListItem title="Ladeverlauf neu laden" onClick={() => setConfirmReset(true)} chevron={false} />
        </List>
      </Section>

      <ConfirmSheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Ladeverlauf neu laden?"
        confirmLabel="Neu laden"
        onConfirm={() => {
          store.setCachedSessions([]);
          setTimeout(() => history.sync(true), 0);
        }}
      >
        Der Zwischenspeicher wird geleert und der komplette Verlauf neu von go-e geholt.
      </ConfirmSheet>
    </Page>
  );
}
