// „Neu in Wall-E …“ – einmal nach jedem Update. Alle Daten bleiben, es muss nichts neu installiert werden.
// Inhalte stehen in src/lib/releases.js. Neue Nutzer sehen stattdessen den Willkommens-Bildschirm.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SparklesIcon } from '@heroicons/react/24/solid';
import { ArrowsRightLeftIcon, BellIcon, CalculatorIcon, ChartBarIcon, LockClosedIcon, ReceiptPercentIcon, UserGroupIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Button } from './ui.jsx';
import * as store from '../lib/storage.js';
import { releasesSince } from '../lib/releases.js';
import { WELCOME_VERSION } from './Welcome.jsx';
import packageInfo from '../../package.json';

const ICONS = { sync: ArrowsRightLeftIcon, lock: LockClosedIcon, bell: BellIcon, users: UserGroupIcon, calc: CalculatorIcon, receipt: ReceiptPercentIcon, chart: ChartBarIcon };

// Vor Einführung dieses Bildschirms gab es keinen gespeicherten Stand – Nutzer von 2.0 sehen alles ab 2.0.1
const FIRST_TRACKED = '2.0.0';

export default function WhatsNew() {
  const navigate = useNavigate();
  const [releases] = useState(() => {
    if (store.getWelcomeSeen() !== WELCOME_VERSION) return []; // Willkommen kommt zuerst
    const seen = store.getSeenVersion() || FIRST_TRACKED;
    if (seen === packageInfo.version) return [];
    const list = releasesSince(seen, packageInfo.version);
    if (list.length === 0) store.setSeenVersion(packageInfo.version);
    return list;
  });
  const [show, setShow] = useState(releases.length > 0);
  if (!show) return null;

  const finish = (to) => {
    store.setSeenVersion(packageInfo.version);
    setShow(false);
    if (to) navigate(to);
  };
  const action = releases[0].action;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-labelledby="whatsnew-title">
      <div className="mx-auto flex min-h-full max-w-md flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
        <div className="animate-pop-in">
          <span className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-primary text-primary-on shadow-card">
            <SparklesIcon className="h-9 w-9" aria-hidden="true" />
          </span>
          <h1 id="whatsnew-title" className="mt-6 text-title text-ink">
            Neu in Wall-E {packageInfo.version}
          </h1>
          <p className="mt-2 text-body text-muted">Deine Daten sind alle noch da – du musst nichts neu einrichten.</p>
        </div>

        {releases.map((release, index) => (
          <section key={release.version} className="mt-8">
            {releases.length > 1 && <h2 className="mb-4 text-caption font-semibold text-muted">{index === 0 ? `Version ${release.version}` : `Außerdem seit deinem letzten Besuch (${release.version})`}</h2>}
            <ul className="space-y-5">
              {release.items.map((item) => {
                const Icon = ICONS[item.icon] || CheckCircleIcon;
                return (
                  <li key={item.title} className="flex gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <div className="text-headline text-ink">{item.title}</div>
                      <div className="text-body text-muted">{item.text}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <div className="mt-auto space-y-2 pt-8">
          {action && (
            <Button variant="secondary" size="lg" block onClick={() => finish(action.to)}>
              {action.label}
            </Button>
          )}
          <Button size="lg" block onClick={() => finish()}>
            Weiter
          </Button>
        </div>
      </div>
    </div>
  );
}
