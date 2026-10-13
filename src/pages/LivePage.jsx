import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowPathIcon, LinkIcon, PlayIcon, ArrowDownTrayIcon, ExclamationTriangleIcon, ChevronDownIcon, BeakerIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import { BoltIcon } from '@heroicons/react/24/solid';
import { Page, Section, Card, List, ListItem, Button, IconButton, Badge, Banner, Stat, EmptyState, Skeleton, PersonDot } from '../components/ui.jsx';
import { useStatus, useBilling, usePersonFilter } from '../hooks/data.js';
import PersonPicker from '../components/PersonPicker.jsx';
import { billingRows } from '../lib/people.js';
import * as store from '../lib/storage.js';
import { formatKw, formatKwh, formatEuro, formatRelative, formatNumber } from '../lib/format.js';

export function DemoBanner() {
  return (
    <div className="flex items-center gap-3 rounded-card bg-warning-soft py-2 pl-4 pr-2 text-warning">
      <BeakerIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-caption">
        <strong className="font-semibold">Demo</strong> – nur Beispieldaten
      </p>
      <Button size="sm" variant="plain" onClick={() => store.setDemoMode(false)}>
        Beenden
      </Button>
    </div>
  );
}

function Welcome() {
  return (
    <Page>
      <EmptyState
        icon={BoltIcon}
        title="Willkommen bei Wall-E"
        action={
          <>
            <Button to="/einstellungen/wallbox" size="lg" icon={LinkIcon} block>
              Wallbox verbinden
            </Button>
            <Button variant="secondary" size="lg" icon={ArrowDownTrayIcon} to="/import" block>
              Daten übernehmen
            </Button>
            <Button variant="ghost" icon={PlayIcon} onClick={() => store.setDemoMode(true)} block>
              Demo ansehen
            </Button>
          </>
        }
      >
        Sieh live, was deine go-e Wallbox lädt, und teile die Stromkosten fair auf alle RFID-Karten auf.
      </EmptyState>
      <p className="px-4 text-center text-caption text-muted">
        Kein Konto nötig – alles bleibt auf diesem Gerät. „Daten übernehmen“ importiert einen geteilten Link oder eine Sicherung.
      </p>
    </Page>
  );
}

function Hero({ status, price }) {
  const sessionKwh = status.sessionWh / 1000;
  return (
    <Card className="relative overflow-hidden">
      {status.isCharging && <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-success/10 blur-2xl" aria-hidden="true" />}
      <div className="relative">
        <Badge tone={status.state.tone} dot={status.isCharging ? 'pulse' : true}>
          {status.state.label}
        </Badge>
        <div className="mt-4 flex items-end gap-2">
          <span className="tabular text-display text-ink">{formatNumber(status.powerW / 1000, 1)}</span>
          <span className="mb-1.5 text-headline text-muted">kW</span>
        </div>
        <p className="mt-1 text-body text-muted">{status.isCharging ? 'Aktuelle Ladeleistung' : 'Gerade keine Ladeleistung'}</p>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
          <Stat label={status.isCharging ? 'Diese Ladung' : 'Letzte Ladung'} value={formatKwh(sessionKwh, true)} hint={`≈ ${formatEuro(sessionKwh * price)}`} />
          <Stat label="Karte" value={status.activeCardName || 'Ohne Karte'} hint={status.isCharging ? 'lädt gerade' : 'zuletzt benutzt'} />
        </div>
      </div>
    </Card>
  );
}

function PeriodPreview({ current, person }) {
  if (!current) return null;
  const rows = billingRows(current).filter((r) => (person ? r.key === person.key : r.kwh > 0 || !r.unassigned));
  if (rows.length === 0 && !person) return null;
  return (
    <Section title={person ? 'Dein Anteil an der laufenden Abrechnung' : 'Laufende Abrechnung'} action={<Link to="/abrechnung" className="text-caption font-semibold text-primary">Details</Link>}>
      <List>
        {rows.length === 0 && <ListItem title="Seit dem Start noch nichts geladen" value={formatEuro(0)} to="/abrechnung" chevron={false} />}
        {rows.map((r) => (
          <ListItem
            key={r.key}
            title={
              <span className="flex items-center gap-2">
                {r.unassigned ? <span className="h-2.5 w-2.5 rounded-full bg-subtle" aria-hidden="true" /> : <PersonDot index={r.colorIndex} />}
                {r.name}
              </span>
            }
            value={formatEuro(r.cost)}
            subtitle={`${formatKwh(r.kwh)}${r.sessions ? ` · ${r.sessions} Ladung${r.sessions === 1 ? '' : 'en'}` : ''}`}
            to={r.unassigned ? '/verlauf?ansicht=offen' : '/abrechnung'}
            chevron={false}
          />
        ))}
      </List>
    </Section>
  );
}

function Technical({ status }) {
  const [open, setOpen] = useState(false);
  return (
    <Section title="Wallbox">
      <Card>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Stat label="Ladestrom" value={status.amp !== null ? `${status.amp} A` : '–'} hint={status.maxAmp ? `max. ${status.maxAmp} A` : undefined} />
          <Stat label="Phasen" value={status.phaseMode} />
          <Stat label="Temperatur" value={status.temperature !== null ? `${formatNumber(status.temperature, 1)} °C` : '–'} />
          <Stat label="Insgesamt geladen" value={formatKwh(status.totalWh / 1000, false)} />
        </div>
        {status.phases.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="-mx-1 mt-4 flex min-h-11 w-[calc(100%+0.5rem)] items-center justify-between rounded-control px-1 text-body font-semibold text-primary"
            >
              Werte pro Phase
              <ChevronDownIcon className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open && (
              <div className="overflow-x-auto">
                <table className="tabular w-full text-body">
                  <thead>
                    <tr className="text-caption text-muted">
                      <th className="py-1.5 text-left font-semibold">Phase</th>
                      <th className="py-1.5 text-right font-semibold">Spannung</th>
                      <th className="py-1.5 text-right font-semibold">Strom</th>
                      <th className="py-1.5 text-right font-semibold">Leistung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {status.phases.map((ph) => (
                      <tr key={ph.name}>
                        <td className="py-2 text-muted">{ph.name}</td>
                        <td className="py-2 text-right">{ph.voltage !== null ? `${formatNumber(ph.voltage, 0)} V` : '–'}</td>
                        <td className="py-2 text-right">{ph.current !== null ? `${formatNumber(ph.current, 1)} A` : '–'}</td>
                        <td className="py-2 text-right">{formatKw(ph.powerW)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>
    </Section>
  );
}

function Cards({ status, person }) {
  const named = status.cards.map((c, i) => ({ ...c, index: i })).filter((c) => c.name && c.name !== 'n/a' && (!person || person.cards.includes(c.name)));
  const unnamed = status.cards.length - named.length;
  if (status.cards.length === 0) return null;
  return (
    <Section title="RFID-Karten" footer={unnamed > 0 ? `${unnamed} weitere Karte${unnamed === 1 ? '' : 'n'} ohne Namen.` : undefined}>
      <List>
        {named.map((c) => (
          <ListItem
            key={c.index}
            icon={CreditCardIcon}
            iconTone={status.activeCardIndex === c.index ? 'success' : 'neutral'}
            title={c.name}
            subtitle={status.activeCardIndex === c.index ? 'Zuletzt benutzt' : undefined}
            value={formatKwh((c.energy || 0) / 1000)}
          />
        ))}
      </List>
    </Section>
  );
}

export default function LivePage() {
  const { status, error, loading, updatedAt, refresh, active, demo, wallbox } = useStatus();
  const { current, price } = useBilling();
  const { person } = usePersonFilter();

  if (!active) return <Welcome />;

  return (
    <Page
      title={demo ? 'Demo-Wallbox' : wallbox.name || 'Live'}
      subtitle={updatedAt ? `Aktualisiert ${formatRelative(updatedAt)}` : loading ? 'Verbinde …' : undefined}
      action={
        <>
          <PersonPicker />
          <IconButton icon={ArrowPathIcon} label="Aktualisieren" onClick={refresh} spinning={loading} />
        </>
      }
    >
      {demo && <DemoBanner />}
      {error && (
        <Banner
          tone="danger"
          icon={ExclamationTriangleIcon}
          title="Wallbox nicht erreichbar"
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="plain" onClick={refresh}>Erneut versuchen</Button>
              <Button size="sm" variant="plain" to="/einstellungen/wallbox">Zugang prüfen</Button>
            </div>
          }
        >
          {error}
          {status && ' Angezeigt wird der letzte bekannte Stand.'}
        </Banner>
      )}

      {status ? (
        <>
          <Hero status={status} price={price.value} />
          <PeriodPreview current={current} person={person} />
          <Technical status={status} />
          <Cards status={status} person={person} />
        </>
      ) : (
        !error && (
          <div className="space-y-4" aria-busy="true" aria-label="Lädt">
            <Skeleton className="h-64 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
          </div>
        )
      )}
    </Page>
  );
}
