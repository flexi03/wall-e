// Willkommens-Bildschirm beim ersten Start von Wall-E 2.
// Waren schon Daten aus Version 1 da, wird vorher automatisch eine Sicherung auf dem Gerät angelegt.
import React, { useState } from 'react';
import { BoltIcon } from '@heroicons/react/24/solid';
import { CheckCircleIcon, UserGroupIcon, ShareIcon, DevicePhoneMobileIcon, DocumentArrowDownIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { Button } from './ui.jsx';
import * as store from '../lib/storage.js';
import { availableSections, buildPayload, saveFile } from '../lib/share.js';

export const WELCOME_VERSION = '2';

const FEATURES = [
  { icon: DevicePhoneMobileIcon, title: 'Neues Design', text: 'Fürs Handy gebaut – Live, Abrechnung, Verlauf und Einstellungen unten in der Leiste.' },
  { icon: UserGroupIcon, title: 'Personen & Ladevorgänge', text: 'Jeder sieht seinen eigenen Verbrauch. Ladungen ohne Karte kannst du zuordnen.' },
  { icon: ShareIcon, title: 'Teilen & Sichern', text: 'Einstellungen per Link, QR-Code oder Datei aufs nächste Handy bringen.' }
];

export default function Welcome() {
  const [show, setShow] = useState(() => store.getWelcomeSeen() !== WELCOME_VERSION);
  const [hadData] = useState(() => store.hasV1Data());
  const [saved, setSaved] = useState(false);

  if (!show) return null;

  const finish = () => {
    store.setWelcomeSeen(WELCOME_VERSION);
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="mx-auto flex min-h-full max-w-md flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
        <div className="animate-pop-in">
          <span className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-primary text-primary-on shadow-card">
            <BoltIcon className="h-9 w-9" aria-hidden="true" />
          </span>
          <h1 id="welcome-title" className="mt-6 text-title text-ink">
            {hadData ? 'Wall-E 2 ist da' : 'Willkommen bei Wall-E'}
          </h1>
          <p className="mt-2 text-body text-muted">
            {hadData
              ? 'Deine Wallbox, Strompreise und alle Abrechnungen sind übernommen – du musst nichts neu einrichten.'
              : 'Sieh live, was deine go-e Wallbox lädt, und teile die Stromkosten fair auf.'}
          </p>
        </div>

        <ul className="mt-8 space-y-5">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
                <f.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="text-headline text-ink">{f.title}</div>
                <div className="text-body text-muted">{f.text}</div>
              </div>
            </li>
          ))}
        </ul>

        {hadData && (
          <div className="mt-8 flex gap-3 rounded-card bg-success-soft p-4 text-success">
            <ShieldCheckIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-caption text-ink/80">
              Eine Sicherung deines bisherigen Stands liegt auf diesem Gerät (wiederherstellbar unter Einstellungen → Teilen & Sichern). Zusätzlich kannst du sie als Datei speichern.
            </p>
          </div>
        )}

        <div className="mt-auto space-y-2 pt-8">
          {hadData && (
            <Button
              variant="secondary"
              size="lg"
              block
              icon={saved ? CheckCircleIcon : DocumentArrowDownIcon}
              onClick={async () => {
                if (await saveFile(buildPayload(availableSections()))) setSaved(true);
              }}
            >
              {saved ? 'Sicherung gespeichert' : 'Sicherung als Datei speichern'}
            </Button>
          )}
          <Button size="lg" block onClick={finish}>
            Los geht’s
          </Button>
        </div>
      </div>
    </div>
  );
}
