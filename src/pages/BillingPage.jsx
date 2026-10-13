import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, FlagIcon, InformationCircleIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { Page, Section, Card, List, ListItem, Button, Banner, Badge, Sheet, NumberField, TextField, Checkbox, Segmented, Skeleton, SplitBar, PersonDot, useToast } from '../components/ui.jsx';
import PersonPicker from '../components/PersonPicker.jsx';
import { useStatus, useBilling, useStored, useHistory, usePersonFilter } from '../hooks/data.js';
import { DemoBanner } from './LivePage.jsx';
import * as store from '../lib/storage.js';
import { closePeriod, suggestChargedKwh, splitBreakdown, STANDARD_LOSS } from '../lib/billing.js';
import { billingRows } from '../lib/people.js';
import { formatKwh, formatEuro, formatPrice, formatPercent, formatDate, formatNumber, toInput } from '../lib/format.js';

const parse = store.parseNumber;

// Hauszähler eintragen (aktueller Stand)
function MeterSheet({ open, onClose, meters }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (open) setValue(toInput(meters.current, 2));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = parse(value);
  const error = value && isNaN(n) ? 'Bitte eine Zahl eingeben' : meters.start !== null && n < meters.start ? 'Kleiner als der Startwert – bitte prüfen' : '';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Zählerstand eintragen"
      footer={
        <Button
          block
          size="lg"
          disabled={isNaN(n)}
          onClick={() => {
            store.setCurrentMeter(n);
            toast('Zählerstand gespeichert');
            onClose();
          }}
        >
          Speichern
        </Button>
      }
    >
      <NumberField label="Hauszähler (Wallbox-Stromkreis)" unit="kWh" value={value} onChange={(e) => setValue(e.target.value)} placeholder="z. B. 5321,4" error={error} hint={meters.start !== null ? `Startwert: ${formatNumber(meters.start, 2)} kWh` : undefined} />
      <p className="mt-4 text-caption text-muted">Mit dem Zählerstand rechnet Wall-E den echten Ladeverlust ein. Ohne aktuellen Wert gelten pauschal {formatPercent(STANDARD_LOSS * 100)}.</p>
    </Sheet>
  );
}

// Startwert der laufenden Abrechnung (V1: „Baseline speichern“)
function StartSheet({ open, onClose, meters, baseline, totals }) {
  const toast = useToast();
  const hasBaseline = typeof baseline.totalEnergyKwh === 'number' && baseline.meterReading !== null;
  const [value, setValue] = useState('');
  const [restart, setRestart] = useState(false);
  useEffect(() => {
    if (open) {
      setValue(toInput(meters.start, 2));
      setRestart(!hasBaseline);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = parse(value);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Startwert"
      footer={
        <Button
          block
          size="lg"
          disabled={isNaN(n) || (restart && !totals)}
          onClick={() => {
            if (restart) store.setStartMeter(n, totals);
            else store.correctStartMeter(n);
            toast(restart ? 'Neue Abrechnung gestartet' : 'Startwert korrigiert');
            onClose();
          }}
        >
          Speichern
        </Button>
      }
    >
      <NumberField label="Hauszähler zu Beginn" unit="kWh" value={value} onChange={(e) => setValue(e.target.value)} placeholder="z. B. 4800" />
      <Card padded={false} className="mt-4">
        <Checkbox
          checked={restart}
          onChange={setRestart}
          disabled={!hasBaseline}
          title="Abrechnung ab jetzt neu beginnen"
          subtitle="Gezählt wird alles, was ab jetzt geladen wird. Sonst wird nur die Zahl korrigiert."
        />
      </Card>
      {restart && !totals && <p className="mt-3 text-caption text-danger">Dafür muss die Wallbox erreichbar sein.</p>}
    </Sheet>
  );
}

// Abrechnung abschließen (V1: „Abrechnung erstellen“)
function CloseSheet({ open, onClose, current, baseline, meters, price }) {
  const toast = useToast();
  const periods = useStored(store.getPeriods);
  const [form, setForm] = useState({ meter: '', kwh: '', price: '', label: '', note: '' });
  const [kwhTouched, setKwhTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const meter = meters.current;
    setForm({
      meter: toInput(meter, 2),
      kwh: toInput(suggestChargedKwh({ meterReading: meter, baseline, current }), 2),
      price: toInput(price, 3),
      label: new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
      note: ''
    });
    setKwhTouched(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [field]: value };
      // kWh folgen dem Zählerstand, solange sie nicht von Hand geändert wurden (wie V1)
      if (field === 'meter' && !kwhTouched) next.kwh = toInput(suggestChargedKwh({ meterReading: parse(value), baseline, current }), 2);
      return next;
    });
    if (field === 'kwh') setKwhTouched(true);
  };

  const meter = parse(form.meter);
  const kwh = parse(form.kwh);
  const p = parse(form.price);
  const valid = !isNaN(meter) && kwh > 0 && p > 0;
  const preview = useMemo(() => (valid ? splitBreakdown(current, kwh, p) : null), [valid, current, kwh, p]);

  const submit = () => {
    const { entry, baseline: next } = closePeriod({ current, baseline, meterReading: meter, chargedKwh: kwh, price: p, label: form.label, note: form.note, existingCount: periods.length });
    store.savePeriods([entry, ...periods], next);
    store.setCurrentMeter(meter);
    toast('Abrechnung gespeichert');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Abrechnung abschließen" footer={<Button block size="lg" icon={CheckCircleIcon} disabled={!valid} onClick={submit}>Abschließen</Button>}>
      <div className="space-y-4">
        {current.unassigned && (
          <Banner tone="warning" icon={QuestionMarkCircleIcon} title={`${current.unassignedCount} Ladevorgang${current.unassignedCount === 1 ? '' : 'e'} ohne Zuordnung`} action={<Button size="sm" variant="plain" to="/verlauf?ansicht=offen">Jetzt zuordnen</Button>}>
            Sie erscheinen in der Abrechnung als eigene Zeile. Ordne sie zu oder lass sie unter „So wird gerechnet“ anteilig verteilen.
          </Banner>
        )}
        <NumberField label="Zählerstand jetzt" unit="kWh" value={form.meter} onChange={set('meter')} error={form.meter && isNaN(meter) ? 'Bitte eine Zahl eingeben' : ''} hint={meters.start !== null ? `Start: ${formatNumber(meters.start, 2)} kWh` : 'Pflichtfeld – wird der Startwert der nächsten Abrechnung'} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Verbrauch" unit="kWh" value={form.kwh} onChange={set('kwh')} />
          <NumberField label="Preis" unit="€/kWh" value={form.price} onChange={set('price')} />
        </div>
        <TextField label="Titel" value={form.label} onChange={set('label')} placeholder="z. B. Oktober 2026" />
        <TextField label="Notiz (optional)" value={form.note} onChange={set('note')} placeholder="z. B. neuer Tarif" />

        {preview && (
          <Card className="bg-surface-2" padded={false}>
            <div className="flex items-baseline justify-between px-4 pt-3">
              <span className="text-caption font-semibold text-muted">Aufteilung</span>
              <span className="tabular text-headline text-ink">{formatEuro(kwh * p)}</span>
            </div>
            <div className="divide-y divide-line">
              {preview.map((u) => {
                const person = current.people.find((x) => x.key === u.personKey);
                return (
                  <div key={u.name} className="flex items-center gap-2 px-4 py-2.5 text-body">
                    {person ? <PersonDot index={person.colorIndex} /> : <span className="h-2.5 w-2.5 rounded-full bg-subtle" aria-hidden="true" />}
                    <span className="flex-1 truncate">{u.name}</span>
                    <span className="tabular text-muted">{formatKwh(u.energyKwh)}</span>
                    <span className="tabular w-20 text-right font-semibold">{formatEuro(u.cost)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        <p className="text-caption text-muted">Danach beginnt die nächste Abrechnung beim eingetragenen Zählerstand. Abgeschlossene Abrechnungen findest du im Verlauf.</p>
      </div>
    </Sheet>
  );
}

function Summary({ current, person }) {
  const rows = billingRows(current);
  const own = person ? rows.find((r) => r.key === person.key) : null;
  const kwhTotal = current.meterKwh && !current.isStandardLoss ? current.meterKwh : current.wallboxKwh * current.factor;
  return (
    <Card>
      {person ? (
        <>
          <div className="flex items-center gap-2 text-caption text-muted">
            <PersonDot index={person.colorIndex} />
            {person.name} · bisher
          </div>
          <div className="tabular mt-1 text-display text-ink">{formatEuro(own ? own.cost : 0)}</div>
          <div className="mt-1 text-body text-muted">
            {formatKwh(own ? own.kwh : 0)} · {formatPercent((own ? own.share : 0) * 100)} von {formatEuro(current.totalCost)}
          </div>
        </>
      ) : (
        <>
          <div className="text-caption text-muted">Kosten bisher</div>
          <div className="tabular mt-1 text-display text-ink">{formatEuro(current.totalCost)}</div>
          <div className="mt-1 text-body text-muted">
            {formatKwh(kwhTotal)} · {formatPrice(current.price)}
          </div>
        </>
      )}
      <div className="mt-5">
        <SplitBar shares={rows.map((r) => r.cost)} colors={rows.map((r) => (r.unassigned ? null : r.colorIndex))} highlight={person ? rows.findIndex((r) => r.key === person.key) : null} />
      </div>
      <div className="mt-4 divide-y divide-line">
        {rows.length === 0 && <p className="py-2 text-body text-muted">Seit dem Start wurde noch nichts geladen.</p>}
        {rows.map((r) => (
          <div key={r.key} className={`flex items-center gap-3 py-3 ${person && r.key !== person.key ? 'opacity-50' : ''}`}>
            {r.unassigned ? <span className="h-3 w-3 shrink-0 rounded-full bg-subtle" aria-hidden="true" /> : <PersonDot index={r.colorIndex} className="h-3 w-3" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-semibold text-ink">{r.name}</div>
              <div className="tabular text-caption text-muted">
                {formatKwh(r.kwh)} · {formatPercent(r.share * 100)}
                {r.sessions ? ` · ${r.sessions} Ladung${r.sessions === 1 ? '' : 'en'}` : ''}
              </div>
            </div>
            {r.unassigned ? (
              <Button size="sm" variant="secondary" to="/verlauf?ansicht=offen">
                Zuordnen
              </Button>
            ) : (
              <div className="tabular text-headline text-ink">{formatEuro(r.cost)}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function BillingPage() {
  const { status, error, active, demo } = useStatus();
  const history = useHistory();
  const { current, baseline, meters, price, periods, from } = useBilling();
  const { person } = usePersonFilter();
  const unassignedMode = useStored(store.getUnassignedMode);
  const [sheet, setSheet] = useState(null);
  const close = () => setSheet(null);

  if (!active) {
    return (
      <Page title="Abrechnung">
        <Banner tone="primary" icon={InformationCircleIcon} title="Noch keine Wallbox verbunden" action={<Button size="sm" to="/einstellungen/wallbox">Wallbox verbinden</Button>}>
          Die Abrechnung braucht die Daten deiner Wallbox.
        </Banner>
      </Page>
    );
  }

  const hasBaseline = typeof baseline.totalEnergyKwh === 'number' && baseline.meterReading !== null;

  return (
    <Page title="Abrechnung" subtitle={from ? `Seit ${formatDate(new Date(from).toISOString())}` : undefined} action={<PersonPicker />}>
      {demo && <DemoBanner />}
      {error && !current && (
        <Banner tone="danger" icon={ExclamationTriangleIcon} title="Wallbox nicht erreichbar">
          {error}
        </Banner>
      )}

      {!current ? (
        !error && <Skeleton className="h-72 rounded-card" />
      ) : (
        <>
          {!hasBaseline && (
            <Banner tone="warning" icon={FlagIcon} title="Noch kein Startwert" action={<Button size="sm" variant="plain" disabled={demo} onClick={() => setSheet('start')}>Startwert setzen</Button>}>
              Gezeigt wird alles, was jemals geladen wurde. Setze einen Startwert, um ab jetzt abzurechnen.
            </Banner>
          )}

          <Summary current={current} person={person} />

          <Button size="lg" block icon={CheckCircleIcon} disabled={demo} onClick={() => setSheet('close')}>
            Abrechnung abschließen
          </Button>

          <Section title="Hauszähler" footer="Der Zählerstand ist optional. Er macht die Kosten genauer, weil er den echten Ladeverlust enthält.">
            <List>
              <ListItem title="Start" subtitle={meters.startAt ? formatDate(meters.startAt) : 'Beginn dieser Abrechnung'} value={meters.start !== null ? `${formatNumber(meters.start, 2)} kWh` : 'Fehlt'} onClick={demo ? undefined : () => setSheet('start')} />
              <ListItem title="Aktuell" subtitle={meters.currentAt ? formatDate(meters.currentAt, true) : 'Noch nicht eingetragen'} value={meters.current !== null ? `${formatNumber(meters.current, 2)} kWh` : 'Eintragen'} onClick={demo ? undefined : () => setSheet('meter')} />
            </List>
          </Section>

          <Section title="Ohne Karte geladen" footer={unassignedMode === 'split' ? 'Nicht zugeordnete Ladungen werden nach Verbrauch auf alle verteilt.' : 'Nicht zugeordnete Ladungen stehen als eigene Zeile da, bis du sie zuordnest.'}>
            <Segmented
              label="Nicht zugeordnete Ladungen"
              value={unassignedMode}
              onChange={demo ? () => {} : store.setUnassignedMode}
              options={[
                { value: 'separate', label: 'Eigene Zeile' },
                { value: 'split', label: 'Anteilig verteilen' }
              ]}
            />
          </Section>

          <Section title="So wird gerechnet">
            <List>
              <ListItem
                title="Grundlage"
                value={current.source === 'sessions' ? `${current.sessionCount} Ladevorgänge` : 'Kartenstände'}
                subtitle={current.source === 'sessions' ? 'aus dem go-e Ladeverlauf' : history.error ? `Ladeverlauf nicht abrufbar: ${history.error}` : current.perCard ? 'pro Karte seit Start' : 'Zuwachs, nach Kartenanteil verteilt'}
              />
              <ListItem title="Wallbox gemessen" value={formatKwh(current.wallboxKwh)} />
              <ListItem title="Hauszähler" value={current.meterKwh !== null ? formatKwh(current.meterKwh) : '–'} />
              <ListItem title="Ladeverlust" value={formatPercent(current.lossPercent)}>
                {current.isStandardLoss && <Badge tone="warning">pauschal</Badge>}
              </ListItem>
              <ListItem title="Strompreis" value={formatPrice(current.price)} to="/einstellungen/strompreis" />
            </List>
          </Section>
        </>
      )}

      <MeterSheet open={sheet === 'meter'} onClose={close} meters={meters} />
      <StartSheet open={sheet === 'start'} onClose={close} meters={meters} baseline={baseline} totals={current && current.totals ? current.totals : null} />
      {current && <CloseSheet open={sheet === 'close'} onClose={close} current={current} baseline={baseline} meters={meters} price={price.value} periods={periods} />}
    </Page>
  );
}
