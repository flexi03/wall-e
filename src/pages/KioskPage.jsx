// Vollbild-Anzeige für ein Tablet an der Wand: immer dunkel, große Schrift, Bildschirm bleibt an
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Badge, PersonDot, Spinner } from '../components/ui.jsx';
import { useStatus, useBilling } from '../hooks/data.js';
import { formatEuro, formatKwh, formatNumber, formatRelative } from '../lib/format.js';

function useWakeLock() {
  useEffect(() => {
    let lock = null;
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        // nicht unterstützt oder abgelehnt – dann geht der Bildschirm normal aus
      }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      if (lock) lock.release().catch(() => {});
    };
  }, []);
}

export default function KioskPage() {
  const { status, error, updatedAt, active, demo, wallbox } = useStatus();
  const { current } = useBilling();
  useWakeLock();

  // Kiosk ist immer dunkel
  useEffect(() => {
    const root = document.documentElement;
    const was = root.classList.contains('dark');
    root.classList.add('dark');
    return () => root.classList.toggle('dark', was);
  }, []);

  return (
    <div className="dark flex min-h-dvh flex-col bg-bg p-6 text-ink lg:p-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title">{demo ? 'Demo-Wallbox' : wallbox.name || 'Wall-E'}</h1>
          {updatedAt && <p className="text-body text-muted">Aktualisiert {formatRelative(updatedAt)}</p>}
        </div>
        <Link to="/einstellungen" aria-label="Kiosk verlassen" className="flex h-11 w-11 items-center justify-center rounded-full text-subtle hover:bg-surface-2 hover:text-ink">
          <XMarkIcon className="h-6 w-6" />
        </Link>
      </header>

      {!active ? (
        <div className="flex flex-1 items-center justify-center text-center text-headline text-muted">Bitte zuerst in der App eine Wallbox verbinden.</div>
      ) : !status ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted">
          {error ? <p className="text-headline text-danger">{error}</p> : <Spinner className="h-10 w-10" />}
        </div>
      ) : (
        <div className="mt-8 grid flex-1 gap-6 lg:grid-cols-2">
          <section className="flex flex-col justify-center rounded-[2rem] bg-surface p-8">
            <div>
              <Badge tone={status.state.tone} dot={status.isCharging ? 'pulse' : true}>
                {status.state.label}
              </Badge>
            </div>
            <div className="mt-6 flex items-end gap-3">
              <span className="tabular text-[6rem] font-bold leading-none tracking-tight">{formatNumber(status.powerW / 1000, 1)}</span>
              <span className="mb-3 text-title text-muted">kW</span>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-6 text-headline">
              <div>
                <div className="text-body text-muted">{status.isCharging ? 'Diese Ladung' : 'Letzte Ladung'}</div>
                <div className="tabular mt-1 text-title">{formatKwh(status.sessionWh / 1000)}</div>
              </div>
              <div>
                <div className="text-body text-muted">Karte</div>
                <div className="mt-1 truncate text-title">{status.activeCardName || '–'}</div>
              </div>
            </div>
          </section>

          <section className="flex flex-col rounded-[2rem] bg-surface p-8">
            <div className="text-body text-muted">Laufende Abrechnung</div>
            <div className="tabular mt-1 text-[3.5rem] font-bold leading-tight">{current ? formatEuro(current.totalCost) : '–'}</div>
            <div className="mt-6 flex-1 divide-y divide-line">
              {current &&
                current.people.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-4 py-4">
                    <PersonDot index={i} className="h-4 w-4" />
                    <span className="flex-1 truncate text-title font-semibold">{p.name}</span>
                    <span className="tabular text-headline text-muted">{formatKwh(p.kwh)}</span>
                    <span className="tabular w-36 text-right text-title font-semibold">{formatEuro(p.cost)}</span>
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
