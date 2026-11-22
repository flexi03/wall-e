import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, FlagIcon, InformationCircleIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { Page, Section, Card, List, ListItem, Button, Banner, Badge, Sheet, NumberField, TextField, Checkbox, Segmented, Skeleton, SplitBar, PersonDot, Receipt, ExpandRow, Timeline, personColor, useToast } from '../components/ui.jsx';
import PersonPicker from '../components/PersonPicker.jsx';
import { useStatus, useBilling, useStored, useHistory, usePeople, usePersonFilter } from '../hooks/data.js';
import { DemoBanner } from './LivePage.jsx';
import * as store from '../lib/storage.js';
import { closePeriod, suggestChargedKwh, splitBreakdown, UNASSIGNED_LABEL } from '../lib/billing.js';
import { billingRows, MAX_PLAUSIBLE_LOSS } from '../lib/people.js';
import { timelineBuckets, timelineTicks, bucketLabel } from '../lib/timeline.js';
import { formatKwh, formatEuro, formatPrice, formatPercent, formatDate, formatNumber, toInput } from '../lib/format.js';

const parse = store.parseNumber;

// Warum der Ladeverlust gerade nicht gemessen werden kann
function lossReasonText(current) {
  switch (current.lossReason) {
    case 'implausible':
      return `Gemessen wären ${formatPercent(current.measuredLossPercent)} – ${current.measuredLossPercent < 0 ? 'unter 0 %' : `über ${formatPercent(MAX_PLAUSIBLE_LOSS * 100)}`} ist unrealistisch. Meist ist der Zählerstand veraltet oder falsch eingetragen. Bitte Hauszähler ablesen und eintragen.`;
    case 'too-little':
      return 'Seit der letzten Ablesung wurde noch zu wenig geladen, um den Ladeverlust zu messen. Bitte später den Hauszähler ablesen.';
    default:
      return 'Seit dem Start wurde der Hauszähler noch nicht abgelesen. Bitte Zählerstand eintragen, dann rechnet Wall-E den echten Ladeverlust ein.';
  }
}

// Zeitpunkt für <input type="datetime-local"> (lokale Zeit, ohne Sekunden)
const toLocalInput = (date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

// Hauszähler eintragen (aktueller Stand) – mit Zeitpunkt der Ablesung, denn nur Ladungen bis dahin
// werden für den Ladeverlust mit dem Zähler verglichen
function MeterSheet({ open, onClose, meters, from }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [readAt, setReadAt] = useState('');
  useEffect(() => {
    if (open) {
      setValue(toInput(meters.current, 2));
      setReadAt(toLocalInput(new Date()));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = parse(value);
  const at = readAt ? new Date(readAt) : null;
  const error = value && isNaN(n) ? 'Bitte eine Zahl eingeben' : meters.start !== null && n < meters.start ? 'Kleiner als der Startwert – bitte prüfen' : '';
  const atError = !at || isNaN(at) ? 'Bitte Datum und Uhrzeit angeben' : at.getTime() > Date.now() + 60000 ? 'Liegt in der Zukunft' : from && at.getTime() < from ? 'Liegt vor dem Beginn der Abrechnung' : '';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Zählerstand eintragen"
      footer={
        <Button
          block
          size="lg"
          disabled={isNaN(n) || !!atError}
          onClick={() => {
            store.setCurrentMeter(n, at.toISOString());
            toast('Zählerstand gespeichert');
            onClose();
          }}
        >
          Speichern
        </Button>
      }
    >
      <div className="space-y-4">
        <NumberField label="Hauszähler (Wallbox-Stromkreis)" unit="kWh" value={value} onChange={(e) => setValue(e.target.value)} placeholder="z. B. 5321,4" error={error} hint={meters.start !== null ? `Startwert: ${formatNumber(meters.start, 2)} kWh` : undefined} />
        <TextField label="Abgelesen am" type="datetime-local" value={readAt} onChange={(e) => setReadAt(e.target.value)} error={readAt ? atError : ''} hint="Wann du den Zähler abgelesen hast – nicht wann du ihn einträgst." />
      </div>
      <p className="mt-4 text-caption text-muted">Mit dem Zählerstand misst Wall-E den echten Ladeverlust. Ohne aktuellen Wert gelten vorläufig {formatPercent(store.getStandardLoss() * 100)}.</p>
    </Sheet>
  );
}

// Startwert der laufenden Abrechnung (V1: „Baseline speichern“)
function StartSheet({ open, onClose, meters, baseline, totals, from }) {
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
            else store.correctStartMeter(n, from);
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

// Pauschaler Ladeverlust, solange der Hauszähler keine Messung erlaubt
function LossSheet({ open, onClose, current }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (open) setValue(toInput(store.getStandardLoss() * 100, 2));
  }, [open]);
  const n = parse(value);
  const error = value && (isNaN(n) || n < 0 || n > 20) ? 'Bitte einen Wert zwischen 0 und 20 eingeben' : '';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ladeverlust pauschal"
      footer={
        <Button
          block
          size="lg"
          disabled={!value || !!error}
          onClick={() => {
            store.setStandardLoss(n);
            toast('Ladeverlust gespeichert');
            onClose();
          }}
        >
          Speichern
        </Button>
      }
    >
      <NumberField label="Ladeverlust, wenn nicht gemessen" unit="%" value={value} onChange={(e) => setValue(e.target.value)} placeholder="z. B. 1,6" error={error} hint={current && current.measuredLossPercent !== null && current.lossReason === 'measured' ? `Zuletzt gemessen: ${formatPercent(current.measuredLossPercent)}` : undefined} />
      <p className="mt-4 text-caption text-muted">
        Wall-E misst den Ladeverlust mit dem Hauszähler: Zählerstand seit Start geteilt durch das, was die Wallbox bis zur Ablesung gemessen hat. Fehlt die Ablesung oder liegt das Ergebnis über {formatPercent(MAX_PLAUSIBLE_LOSS * 100)}, wird vorläufig mit diesem Wert gerechnet.
      </p>
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

// Woher „zu bezahlen“ kommt
function calcFooter(current) {
  if (current.isStandardLoss) return `Vorläufig: Ladevorgänge plus ${formatPercent(current.lossPercent)} pauschaler Ladeverlust, bis der Hauszähler abgelesen ist. Jede Person zahlt ihren Anteil an den Ladevorgängen.`;
  if (current.afterReadingKwh !== null && current.afterReadingKwh !== undefined && current.afterReadingKwh > 0) {
    return `Zu bezahlen = Hauszähler ${formatKwh(current.meterKwh, true)} bis zur Ablesung + ${formatKwh(current.paidKwh - current.meterKwh, true)} für das, was danach geladen wurde (mit ${formatPercent(current.lossPercent)} hochgerechnet). Jede Person zahlt ihren Anteil an den Ladevorgängen.`;
  }
  return 'Zu bezahlen = Hauszähler seit Start. Jede Person zahlt ihren Anteil an den Ladevorgängen.';
}

function lossSubtitle(current) {
  if (current.lossReason === 'measured') return 'Hauszähler ÷ Wallbox';
  if (current.lossReason === 'implausible') return `gemessen ${formatPercent(current.measuredLossPercent)} – unplausibel`;
  if (current.lossReason === 'too-little') return 'bis zur Ablesung zu wenig geladen';
  if (current.lossReason === 'no-reading') return 'Hauszähler noch nicht abgelesen';
  return undefined;
}

const plural = (n, one, many) => `${formatNumber(n, 0)} ${n === 1 ? one : many}`;
const lossLabel = (current) => `Ladeverlust ${formatPercent(current.lossPercent)}${current.isStandardLoss ? ' (vorläufig)' : ''}`;

// Rechenweg einer Person: geladen + Anteil Ladeverlust = zu zahlen
function personLines(row, current) {
  const charged = row.kwh * current.price;
  return [
    { label: 'Geladen', hint: row.sessions ? plural(row.sessions, 'Ladung', 'Ladungen') : undefined, euro: formatEuro(charged), kwh: formatKwh(row.kwh, true) },
    { op: '+', label: lossLabel(current), euro: formatEuro(row.cost - charged), kwh: formatKwh(row.lossKwh, true) },
    { op: '=', label: 'Zu zahlen', euro: formatEuro(row.cost), kwh: formatKwh(row.paidKwh, true) }
  ];
}

// Rechenweg für alle: Ladevorgänge + Ladeverlust = zu bezahlen (Hauszähler)
function totalLines(current) {
  return [
    { label: 'Ladevorgänge', hint: current.sessionCount ? plural(current.sessionCount, 'Ladung', 'Ladungen') : 'Wallbox', euro: formatEuro(current.baseCost), kwh: formatKwh(current.wallboxKwh, true) },
    { op: '+', label: lossLabel(current), euro: formatEuro(current.totalCost - current.baseCost), kwh: formatKwh(current.lossKwh, true) },
    { op: '=', label: 'Zu bezahlen', hint: current.isStandardLoss ? 'vorläufig' : 'laut Hauszähler', euro: formatEuro(current.totalCost), kwh: formatKwh(current.paidKwh, true) }
  ];
}

function Summary({ current, person }) {
  const [openKey, setOpenKey] = useState(null);
  const rows = billingRows(current).filter((r) => r.kwh > 0 || (person && r.key === person.key));
  const own = person ? billingRows(current).find((r) => r.key === person.key) : null;
  return (
    <Card>
      {person ? (
        <>
          <div className="flex items-center gap-2 text-caption text-muted">
            <PersonDot index={person.colorIndex} />
            {person.name} · bisher
          </div>
          <div className="tabular mt-1 text-display text-ink">{formatEuro(own ? own.cost : 0)}</div>
          <div className="tabular mt-1 text-body text-muted">
            {formatPercent((own ? own.share : 0) * 100)} von {formatEuro(current.totalCost)}
          </div>
          {own && own.kwh > 0 && (
            <div className="mt-4 rounded-control bg-surface-2 px-3 py-1.5">
              <Receipt lines={personLines(own, current)} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-caption text-muted">Kosten bisher</div>
          <div className="tabular mt-1 text-display text-ink">{formatEuro(current.totalCost)}</div>
          <div className="tabular mt-1 text-body text-muted">
            {formatKwh(current.wallboxKwh)} geladen + {formatPercent(current.lossPercent)} Ladeverlust{current.isStandardLoss ? ' (vorläufig)' : ''}
          </div>
        </>
      )}
      <div className="mt-5">
        <SplitBar shares={rows.map((r) => r.cost)} colors={rows.map((r) => (r.unassigned ? null : r.colorIndex))} highlight={person ? rows.findIndex((r) => r.key === person.key) : null} />
      </div>
      <div className="mt-2 divide-y divide-line">
        {rows.length === 0 && <p className="py-3 text-body text-muted">Seit dem Start wurde noch nichts geladen.</p>}
        {rows.map((r) => (
          <ExpandRow
            key={r.key}
            open={openKey === r.key}
            onToggle={() => setOpenKey(openKey === r.key ? null : r.key)}
            dimmed={person && r.key !== person.key}
            leading={r.unassigned ? <span className="h-3 w-3 shrink-0 rounded-full bg-subtle" aria-hidden="true" /> : <PersonDot index={r.colorIndex} className="h-3 w-3" />}
            title={r.name}
            subtitle={`${formatKwh(r.kwh)} · ${formatPercent(r.share * 100)}`}
            value={formatEuro(r.cost)}
          >
            <Receipt lines={personLines(r, current)} />
            {r.unassigned && (
              <div className="pb-2 pt-1">
                <Button size="sm" variant="secondary" block to="/verlauf?ansicht=offen">
                  Ladungen zuordnen
                </Button>
              </div>
            )}
          </ExpandRow>
        ))}
      </div>
      {rows.length > 0 && <p className="mt-1 text-caption text-muted">Person antippen für den Rechenweg.</p>}
    </Card>
  );
}

// Wer hat wann wie viel geladen – Balken je Tag/Woche/Monat, gestapelt nach Person
const UNIT_TEXT = { day: 'ein Tag', week: 'eine Woche', month: 'ein Monat' };

function TimelineSection({ current, person }) {
  const { sessions } = useHistory();
  const { persons, owners } = usePeople();
  const data = useMemo(() => timelineBuckets({ sessions, persons, owners, from: current.from }), [sessions, persons, owners, current.from]);
  const [selected, setSelected] = useState(null);
  if (current.source !== 'sessions' || data.buckets.length === 0) return null;
  let last = data.buckets.length - 1;
  while (last > 0 && data.buckets[last].count === 0) last -= 1;
  const index = selected !== null && selected < data.buckets.length ? selected : last;
  const bucket = data.buckets[index];
  const byKey = new Map(persons.map((p) => [p.key, p]));
  const colorOf = (key) => (byKey.has(key) ? personColor(byKey.get(key).colorIndex) : 'rgb(var(--subtle))');
  return (
    <Section title="Wer hat wann geladen" footer={`Ein Balken = ${UNIT_TEXT[data.unit]}. Antippen oder darüberwischen zeigt die Details.`}>
      <Card>
        <Timeline
          buckets={data.buckets}
          colorOf={colorOf}
          selected={index}
          onSelect={setSelected}
          highlight={person ? person.key : null}
          ticks={timelineTicks(data.buckets, data.unit)}
          label={`Ladungen seit Beginn der Abrechnung, ${data.buckets.length} Balken`}
        />
        <div className="mt-3 border-t border-line pt-3" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-body font-semibold text-ink">{bucketLabel(bucket, data.unit)}</span>
            <span className="tabular shrink-0 text-caption text-muted">{bucket.count ? `${formatKwh(bucket.kwh)} · ${plural(bucket.count, 'Ladung', 'Ladungen')}` : 'keine Ladung'}</span>
          </div>
          {bucket.parts.map((p) => {
            const who = byKey.get(p.key);
            return (
              <div key={p.key} className={`tabular mt-2 flex items-center gap-2 text-body ${person && p.key !== person.key ? 'opacity-50' : ''}`}>
                {who ? <PersonDot index={who.colorIndex} /> : <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-subtle" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate text-ink">{who ? who.name : UNASSIGNED_LABEL}</span>
                <span className="text-caption text-muted">{plural(p.count, 'Ladung', 'Ladungen')}</span>
                <span className="w-24 text-right text-ink">{formatKwh(p.kwh)}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </Section>
  );
}

export default function BillingPage() {
  const { status, error, active, demo } = useStatus();
  const history = useHistory();
  const { current, baseline, meters, price, periods, from, standardLoss } = useBilling();
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

          {hasBaseline && current.isStandardLoss && current.lossReason && (
            <Banner tone="warning" icon={ExclamationTriangleIcon} title={`Vorläufig mit ${formatPercent(current.lossPercent)} Ladeverlust`} action={!demo && <Button size="sm" variant="plain" onClick={() => setSheet('meter')}>Zählerstand eintragen</Button>}>
              {lossReasonText(current)}
            </Banner>
          )}

          <Summary current={current} person={person} />

          <Button size="lg" block icon={CheckCircleIcon} disabled={demo} onClick={() => setSheet('close')}>
            Abrechnung abschließen
          </Button>

          <TimelineSection current={current} person={person} />

          <Section title="Hauszähler" footer="Der Zählerstand ist optional. Er macht die Kosten genauer, weil er den echten Ladeverlust enthält.">
            <List>
              <ListItem title="Start" subtitle={from ? formatDate(new Date(from).toISOString()) : 'Beginn dieser Abrechnung'} value={meters.start !== null ? `${formatNumber(meters.start, 2)} kWh` : 'Fehlt'} onClick={demo ? undefined : () => setSheet('start')} />
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

          <Section title="So wird gerechnet" footer={calcFooter(current)}>
            <Card>
              <Receipt lines={totalLines(current)} />
            </Card>
          </Section>

          <Section title="Ladeverlust">
            <List>
              <ListItem title="Ladeverlust" subtitle={lossSubtitle(current)} value={formatPercent(current.lossPercent)}>
                {current.isStandardLoss ? <Badge tone="warning">vorläufig</Badge> : <Badge tone="success">gemessen</Badge>}
              </ListItem>
              {current.source === 'sessions' && current.meterKwh !== null && (
                <>
                  <ListItem title="Hauszähler" subtitle={current.meterReadAt ? `bis ${formatDate(new Date(current.meterReadAt).toISOString())}` : 'seit Start'} value={formatKwh(current.meterKwh, true)} />
                  <ListItem title="Wallbox" subtitle="gleicher Zeitraum" value={current.wallboxKwhUntilReading !== null ? formatKwh(current.wallboxKwhUntilReading, true) : '–'} />
                </>
              )}
              <ListItem title="Pauschal, wenn nicht messbar" value={formatPercent(standardLoss * 100)} onClick={demo ? undefined : () => setSheet('loss')} />
              <ListItem title="Strompreis" value={formatPrice(current.price)} to="/einstellungen/strompreis" />
              <ListItem
                title="Grundlage"
                value={current.source === 'sessions' ? `${current.sessionCount} Ladevorgänge` : 'Kartenstände'}
                subtitle={current.source === 'sessions' ? 'aus dem go-e Ladeverlauf' : history.error ? `Ladeverlauf nicht abrufbar: ${history.error}` : current.perCard ? 'pro Karte seit Start' : 'Zuwachs, nach Kartenanteil verteilt'}
              />
            </List>
          </Section>
        </>
      )}

      <MeterSheet open={sheet === 'meter'} onClose={close} meters={meters} from={from} />
      <StartSheet open={sheet === 'start'} onClose={close} meters={meters} baseline={baseline} from={from} totals={current && current.totals ? current.totals : null} />
      <LossSheet open={sheet === 'loss'} onClose={close} current={current} />
      {current && <CloseSheet open={sheet === 'close'} onClose={close} current={current} baseline={baseline} meters={meters} price={price.value} periods={periods} />}
    </Page>
  );
}
