import React, { useEffect, useState } from 'react';
import {
  BoltIcon,
  CurrencyEuroIcon,
  ShareIcon,
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  ComputerDesktopIcon,
  SunIcon,
  MoonIcon,
  TvIcon,
  QuestionMarkCircleIcon,
  DevicePhoneMobileIcon,
  TrashIcon,
  PlayIcon,
  StopIcon,
  UserGroupIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { Page, Section, List, ListItem, Segmented, ConfirmSheet, Sheet, useToast } from '../components/ui.jsx';
import { useStored, useStatus } from '../hooks/data.js';
import * as store from '../lib/storage.js';
import { getUndoInfo, undoImport } from '../lib/share.js';
import { canPromptInstall, promptInstall, onInstallChange, isStandalone, isIos } from '../lib/install.js';
import { formatPrice, formatDate } from '../lib/format.js';
import packageInfo from '../../package.json';

function useInstallAvailable() {
  const [available, setAvailable] = useState(canPromptInstall());
  useEffect(() => onInstallChange(() => setAvailable(canPromptInstall())), []);
  return available;
}

export default function SettingsPage() {
  const toast = useToast();
  const { wallbox, demo } = useStatus();
  const price = useStored(store.getPrice);
  const theme = useStored(store.getThemePreference);
  const undo = useStored(getUndoInfo);
  const profileCount = useStored(() => store.getProfiles().length);
  const installAvailable = useInstallAvailable();
  const [confirm, setConfirm] = useState(null);
  const [iosHelp, setIosHelp] = useState(false);
  const showInstall = !isStandalone() && (installAvailable || isIos());

  return (
    <Page title="Einstellungen">
      <Section title="Wallbox">
        <List>
          <ListItem
            icon={BoltIcon}
            title={wallbox.isConfigured ? wallbox.name || 'go-e Wallbox' : 'Wallbox verbinden'}
            subtitle={wallbox.isConfigured ? `Seriennummer ${wallbox.serial}` : 'Seriennummer und API-Token eingeben'}
            to="/einstellungen/wallbox"
          />
          {demo ? (
            <ListItem icon={StopIcon} iconTone="warning" title="Demo beenden" onClick={() => store.setDemoMode(false)} />
          ) : (
            !wallbox.isConfigured && <ListItem icon={PlayIcon} iconTone="neutral" title="Demo ansehen" onClick={() => store.setDemoMode(true)} />
          )}
        </List>
      </Section>

      <Section title="Abrechnung">
        <List>
          <ListItem icon={CurrencyEuroIcon} iconTone="success" title="Strompreis" value={price.isSet ? formatPrice(price.value) : 'Nicht gesetzt'} to="/einstellungen/strompreis" />
          <ListItem icon={UserGroupIcon} title="Personen" subtitle="Profile, RFID-Karten, „Das bin ich“" value={profileCount ? String(profileCount) : undefined} to="/einstellungen/personen" />
          <ListItem icon={ClockIcon} iconTone="neutral" title="Ladeverlauf" subtitle="Einzelne Ladevorgänge von go-e" to="/einstellungen/ladeverlauf" />
        </List>
      </Section>

      <Section title="Daten" footer="Teile deine Einstellungen mit einem anderen Gerät oder sichere sie als Datei.">
        <List>
          <ListItem icon={ShareIcon} title="Teilen & Sichern" to="/einstellungen/teilen" />
          <ListItem icon={ArrowDownTrayIcon} title="Daten übernehmen" subtitle="Link, QR-Code oder Datei" to="/import" />
          {undo && <ListItem icon={ArrowUturnLeftIcon} iconTone="warning" title="Letzten Import rückgängig machen" subtitle={`Import vom ${formatDate(undo.at, true)}`} onClick={() => setConfirm('undo')} />}
        </List>
      </Section>

      <Section title="Darstellung">
        <Segmented
          label="Design"
          value={theme}
          onChange={store.setThemePreference}
          options={[
            { value: 'system', label: 'Automatisch', icon: ComputerDesktopIcon },
            { value: 'light', label: 'Hell', icon: SunIcon },
            { value: 'dark', label: 'Dunkel', icon: MoonIcon }
          ]}
        />
      </Section>

      <Section title="Mehr">
        <List>
          {showInstall && (
            <ListItem
              icon={DevicePhoneMobileIcon}
              title="Als App installieren"
              subtitle="Startet wie eine normale App vom Home-Bildschirm"
              onClick={async () => {
                if (installAvailable) await promptInstall();
                else setIosHelp(true);
              }}
            />
          )}
          <ListItem icon={TvIcon} iconTone="neutral" title="Kiosk-Ansicht" subtitle="Vollbild für ein Tablet an der Wand" to="/kiosk" />
          <ListItem icon={QuestionMarkCircleIcon} iconTone="neutral" title="Hilfe & Datenschutz" to="/info" />
        </List>
      </Section>

      <Section footer="Entfernt Wallbox-Zugang, Strompreise, Zählerstände und alle Abrechnungen von diesem Gerät.">
        <List>
          <ListItem icon={TrashIcon} danger title="Alle Daten löschen" onClick={() => setConfirm('clear')} chevron={false} />
        </List>
      </Section>

      <p className="text-center text-caption text-subtle">Wall-E {packageInfo.version}</p>

      <ConfirmSheet
        open={confirm === 'clear'}
        onClose={() => setConfirm(null)}
        title="Alle Daten löschen?"
        confirmLabel="Endgültig löschen"
        danger
        onConfirm={() => {
          store.clearAll();
          toast('Alle Daten gelöscht');
        }}
      >
        Das lässt sich nicht rückgängig machen. Tipp: Sichere vorher unter „Teilen & Sichern“ eine Datei.
      </ConfirmSheet>
      <ConfirmSheet
        open={confirm === 'undo'}
        onClose={() => setConfirm(null)}
        title="Import rückgängig machen?"
        confirmLabel="Rückgängig machen"
        onConfirm={() => {
          undoImport();
          toast('Vorheriger Stand wiederhergestellt');
        }}
      >
        Alle Bereiche, die beim letzten Import überschrieben wurden, bekommen wieder ihren vorherigen Stand.
      </ConfirmSheet>
      <Sheet open={iosHelp} onClose={() => setIosHelp(false)} title="Zum Home-Bildschirm">
        <ol className="list-decimal space-y-2 pl-5 text-body text-ink">
          <li>Tippe in Safari unten auf <strong>Teilen</strong> (Quadrat mit Pfeil).</li>
          <li>Wähle <strong>Zum Home-Bildschirm</strong>.</li>
          <li>Tippe auf <strong>Hinzufügen</strong>.</li>
        </ol>
        <p className="mt-4 text-caption text-muted">Hinweis: Die installierte App hat auf dem iPhone einen eigenen Speicher. Übertrage deine Daten danach mit „Teilen & Sichern“.</p>
      </Sheet>
    </Page>
  );
}
