import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClockIcon,
  PencilSquareIcon,
  TrashIcon,
  ArchiveBoxIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckIcon,
  Cog6ToothIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import {
  Page,
  Section,
  Card,
  List,
  ListItem,
  Button,
  IconButton,
  Banner,
  Badge,
  PersonBadge,
  SplitLegend,
  Sheet,
  ConfirmSheet,
  NumberField,
  TextField,
  EmptyState,
  Segmented,
  PersonDot,
  SplitBar,
  Stat,
  useToast
} from '../components/ui.jsx';
import PersonPicker from '../components/PersonPicker.jsx';
import { DemoBanner } from './LivePage.jsx';
import { useStored, useHistory, usePeople, usePersonFilter, useStatus } from '../hooks/data.js';
import * as store from '../lib/storage.js';
import { editPeriod, deletePeriod, periodTotals, UNASSIGNED_LABEL } from '../lib/billing.js';
import { ownerOf, personForCard, UNASSIGNED } from '../lib/people.js';
import { sessionStats, suggestAll } from '../lib/suggest.js';
import { formatKwh, formatEuro, formatPrice, formatDate, formatNumber, formatRelative, toInput } from '../lib/format.js';

// ---------- Hilfen ----------

const weekday = (ms) =>
  new Date(ms).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
const time = (ms) =>
  new Date(ms).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
const monthLabel = (ms) => new Date(ms).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

function duration(seconds) {
  if (!seconds && seconds !== 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

const kw = (n) => `${formatNumber(n, 1)} kW`;

// "3 h 36 min geladen (32 %) · Ø 10,9 / max. 11,5 kW" – Prozent = Anteil der Ladezeit an der Ansteckzeit
function statsLine(session) {
  const { avgKw, peakKw } = sessionStats(session);
  const power = avgKw && peakKw ? `Ø ${formatNumber(avgKw, 1)} / max. ${kw(peakKw)}` : peakKw ? `max. ${kw(peakKw)}` : avgKw ? `Ø ${kw(avgKw)}` : null;
  const { chargingShare } = sessionStats(session);
  const time = duration(session.chargedSeconds);
  return [time ? `${time} geladen${chargingShare !== null && chargingShare < 0.95 ? ` (${Math.round(chargingShare * 100)} %)` : ''}` : null, power].filter(Boolean).join(' · ');
}

function SuggestBadge({ person }) {
  return person ? <PersonBadge index={person.colorIndex}>{person.name}?</PersonBadge> : null;
}

function Dot({ person }) {
  return person ? (
    <PersonDot index={person.colorIndex} className="h-3 w-3" />
  ) : (
    <span className="h-3 w-3 shrink-0 rounded-full border-2 border-dashed border-warning" aria-hidden="true" />
  );
}

// Anteil einer Person an einer abgeschlossenen Abrechnung (null = alle)
function shareOf(period, person) {
  if (!person) return null;
  return (period.userBreakdown || []).filter((u) => u.personKey === person.key || (!u.personKey && (u.name === person.name || person.cards.includes(u.name))));
}

// ---------- Ladevorgänge ----------

function AssignList({ persons, value, card, onChange, suggestedKey }) {
  const cardPerson = personForCard(persons, card);
  const options = [
    card
      ? {
          key: '',
          label: 'Automatisch über Karte',
          hint: cardPerson ? `→ ${cardPerson.name}` : card
        }
      : { key: '', label: 'Nicht zugeordnet', hint: 'zählt als „ohne Karte“' },
    ...persons.map((p) => ({ key: p.key, label: p.name, person: p, suggested: p.key === suggestedKey }))
  ];
  return (
    <div className="-mx-5 divide-y divide-line border-y border-line">
      {options.map((o) => (
        <button
          key={o.key || 'auto'}
          type="button"
          onClick={() => onChange(o.key || null)}
          className="flex min-h-[3.25rem] w-full items-center gap-3 px-5 text-left hover:bg-surface-2"
        >
          {o.person ? <PersonDot index={o.person.colorIndex} className="h-3 w-3" /> : <span className="h-3 w-3 shrink-0 rounded-full bg-subtle" aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body text-ink">{o.label}</span>
            {o.hint && <span className="block truncate text-caption text-muted">{o.hint}</span>}
          </span>
          {o.suggested && <PersonBadge index={o.person.colorIndex}>Vorschlag</PersonBadge>}
          {value !== null && (value || '') === o.key && <CheckIcon className="h-5 w-5 text-primary" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

// Dauer in Stunden als Text, z. B. "3 h 36 min"
const hoursText = (h) => (h === null || h === undefined ? '–' : duration(Math.round(h * 3600)));

function SessionSheet({ session, persons, owners, price, onClose, readOnly, suggestion, powers }) {
  const toast = useToast();
  if (!session) return null;
  const ownerKey = ownerOf(session, persons, owners);
  const owner = persons.find((p) => p.key === ownerKey);
  const suggested = suggestion ? persons.find((p) => p.key === suggestion.key) : null;
  const stats = sessionStats(session);
  const endsOtherDay = new Date(session.end).toDateString() !== new Date(session.start).toDateString();
  const assign = (key) => {
    store.setSessionOwners([session.id], key);
    toast('Zuordnung gespeichert');
    onClose();
  };
  // Titel = Beginn (Anstecken) des Ladevorgangs
  return (
    <Sheet open onClose={onClose} title={`${weekday(session.start)}, ${time(session.start)} Uhr`}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat label="Energie" value={formatKwh(session.kwh, true)} hint={`≈ ${formatEuro(session.kwh * price)}`} />
        <Stat label="Karte" value={session.card || 'Ohne Karte'} hint={owner ? `gehört zu ${owner.name}` : 'noch niemandem zugeordnet'} />
        <Stat label="Ø Leistung" value={stats.avgKw ? kw(stats.avgKw) : '–'} hint="über die reine Ladezeit" />
        <Stat
          label="Spitzenleistung"
          value={stats.peakKw ? kw(stats.peakKw) : '–'}
          hint={stats.peakKw ? (stats.peakKw < 4.5 ? 'typisch einphasig' : stats.peakKw > 6.5 ? 'typisch dreiphasig' : 'zwischen ein- und dreiphasig') : undefined}
        />
      </div>

      <Card className="mt-5 bg-surface-2 shadow-none">
        <div className="mb-3 text-caption text-muted">
          Angesteckt {time(session.start)} – {time(session.end)} Uhr{endsOtherDay ? ` (${formatDate(new Date(session.end).toISOString())})` : ''} ·{' '}
          {hoursText(stats.connectedHours)}
        </div>
        {stats.chargingHours !== null ? (
          <SplitLegend
            parts={[
              { label: 'Geladen', value: stats.chargingHours, text: hoursText(stats.chargingHours), className: 'bg-success' },
              { label: 'Standzeit', value: stats.idleHours, text: hoursText(stats.idleHours), className: 'bg-subtle' }
            ]}
          />
        ) : (
          <p className="text-body text-muted">go-e liefert für diesen Ladevorgang keine reine Ladezeit.</p>
        )}
      </Card>

      {!readOnly && !owner && suggested && (
        <div className="mt-5">
          <Banner
            tone="primary"
            icon={SparklesIcon}
            title={`Passt zu ${suggested.name}`}
            action={
              <Button size="sm" onClick={() => assign(suggested.key)}>
                {suggested.name} zuordnen
              </Button>
            }
          >
            {suggested.name} lädt typischerweise mit {kw(suggestion.kw)}
            {powers.get(suggested.key) && powers.get(suggested.key).learned ? ' (gelernt aus bisherigen Ladevorgängen)' : ''}, dieser Ladevorgang mit {kw(stats.peakKw)}.
          </Banner>
        </div>
      )}

      <h3 className="mb-2 mt-6 text-caption font-semibold text-muted">
        Gehört zu: {owner ? <span className="text-ink">{owner.name}</span> : <span className="text-warning">niemandem</span>}
      </h3>
      {readOnly ? (
        <p className="text-body text-muted">Im Demo-Modus kann nichts zugeordnet werden.</p>
      ) : (
        <AssignList persons={persons} card={session.card} value={owners[session.id] || ''} suggestedKey={suggested ? suggested.key : null} onChange={assign} />
      )}
    </Sheet>
  );
}

// filter: 'all' (ohne Person: alle; mit Person: ihre + offene), 'mine' (nur die Person), 'open' (nur offene)
function SessionsView({ filter, setFilter }) {
  const onlyOpen = filter === 'open';
  const toast = useToast();
  const { demo } = useStatus();
  const history = useHistory();
  const { persons, owners } = usePeople();
  const { person } = usePersonFilter();
  const price = useStored(store.getPrice);
  const [openId, setOpenId] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [months, setMonths] = useState(3);

  const withOwner = useMemo(
    () =>
      history.sessions.map((s) => ({
        ...s,
        owner: ownerOf(s, persons, owners)
      })),
    [history.sessions, persons, owners]
  );
  const { suggestions, powers } = useMemo(() => suggestAll(history.sessions, persons, owners), [history.sessions, persons, owners]);
  const [confirmAll, setConfirmAll] = useState(false);
  const openCount = withOwner.filter((s) => s.owner === UNASSIGNED).length;
  const visible = withOwner.filter((s) => {
    if (onlyOpen) return s.owner === UNASSIGNED;
    if (!person) return true;
    if (filter === 'mine') return s.owner === person.key;
    return s.owner === person.key || s.owner === UNASSIGNED;
  });

  const groups = useMemo(() => {
    const map = new Map();
    visible.forEach((s) => {
      const key = monthLabel(s.start);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return [...map.entries()];
  }, [visible]);

  const session = withOwner.find((s) => s.id === openId) || null;
  const toggle = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  if (!history.available) {
    return (
      <>
        {history.error && (
          <Banner
            tone="danger"
            icon={ExclamationTriangleIcon}
            title="Ladeverlauf nicht abrufbar"
            action={
              <Button size="sm" variant="plain" onClick={() => history.sync(true)}>
                Erneut versuchen
              </Button>
            }
          >
            {history.error}
          </Banner>
        )}
        <EmptyState
          icon={ClockIcon}
          title={history.loading ? 'Ladeverlauf wird geladen …' : 'Noch kein Ladeverlauf'}
          action={
            !history.loading && (
              <Button variant="secondary" icon={Cog6ToothIcon} to="/einstellungen/ladeverlauf">
                Ladeverlauf einrichten
              </Button>
            )
          }
        >
          {history.link
            ? 'Wall-E holt die einzelnen Ladevorgänge aus dem go-e Ladeverlauf.'
            : 'Deine Wallbox hat noch keinen Export-Link geliefert. Du kannst ihn unter Einstellungen → Ladeverlauf eintragen.'}
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {history.error && (
        <Banner tone="warning" icon={ExclamationTriangleIcon} title="Aktualisierung fehlgeschlagen">
          {history.error} Angezeigt wird der zuletzt geladene Stand.
        </Banner>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Segmented
            label="Filter"
            value={person || filter !== 'mine' ? filter : 'all'}
            onChange={setFilter}
            options={[
              ...(person
                ? [
                    { value: 'all', label: `${person.name} & offen` },
                    { value: 'mine', label: person.name }
                  ]
                : [{ value: 'all', label: 'Alle' }]),
              { value: 'open', label: `Offen${openCount ? ` (${openCount})` : ''}` }
            ]}
          />
        </div>
        <IconButton icon={ArrowPathIcon} label="Ladeverlauf aktualisieren" onClick={() => history.sync(true)} spinning={history.loading} />
      </div>

      {filter !== 'mine' && (onlyOpen || person) && !demo && suggestions.size > 0 && (
        <Banner
          tone="primary"
          icon={SparklesIcon}
          title={`${suggestions.size} Vorschl${suggestions.size === 1 ? 'ag' : 'äge'} nach Ladeleistung`}
          action={
            <Button size="sm" onClick={() => setConfirmAll(true)}>
              Alle übernehmen
            </Button>
          }
        >
          Verglichen wird die Spitzenleistung mit der typischen Ladeleistung jeder Person (einstellbar unter Personen).
        </Banner>
      )}
      {onlyOpen && !demo && suggestions.size === 0 && openCount > 0 && powers.size === 0 && (
        <Banner
          tone="primary"
          icon={SparklesIcon}
          title="Tipp: Vorschläge einschalten"
          action={
            <Button size="sm" variant="plain" to="/einstellungen/personen">
              Zu den Personen
            </Button>
          }
        >
          Trag in den Profilen ein, wie schnell das jeweilige Auto lädt (z. B. 3,7 kW einphasig oder 11 kW dreiphasig). Dann schlägt Wall-E die passende Person vor.
        </Banner>
      )}

      {visible.length === 0 ? (
        <Card>
          <p className="py-4 text-center text-body text-muted">{onlyOpen ? 'Alle Ladevorgänge sind zugeordnet.' : 'Keine Ladevorgänge für diese Auswahl.'}</p>
        </Card>
      ) : (
        groups.slice(0, months).map(([label, list], index) => (
          <Section
            key={label}
            title={`${label} · ${formatKwh(list.reduce((sum, s) => sum + s.kwh, 0))}`}
            action={
              index === 0 &&
              !demo && (
                <button
                  type="button"
                  className="min-h-8 text-caption font-semibold text-primary"
                  onClick={() => {
                    setSelecting((v) => !v);
                    setPicked([]);
                  }}
                >
                  {selecting ? 'Fertig' : 'Mehrere zuordnen'}
                </button>
              )
            }
          >
            <List>
              {list.map((s) => {
                const owner = persons.find((p) => p.key === s.owner);
                const isPicked = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => (selecting ? toggle(s.id) : setOpenId(s.id))}
                    aria-pressed={selecting ? isPicked : undefined}
                    className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    {selecting ? (
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${isPicked ? 'border-primary bg-primary text-primary-on' : 'border-line'}`}
                        aria-hidden="true"
                      >
                        {isPicked && <CheckIcon className="h-4 w-4" />}
                      </span>
                    ) : (
                      <Dot person={owner} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-body text-ink">
                          {weekday(s.start)} · {time(s.start)}
                        </span>
                        {!owner &&
                          !selecting &&
                          (suggestions.has(s.id) ? <SuggestBadge person={persons.find((p) => p.key === suggestions.get(s.id).key)} /> : <Badge tone="warning">offen</Badge>)}
                      </span>
                      {owner && (
                        <span className="block truncate text-caption text-muted">
                          {owner.name}
                          {s.card && owner.name !== s.card ? ` (${s.card})` : ''}
                        </span>
                      )}
                      <span className="tabular block truncate text-caption text-muted">{statsLine(s)}</span>
                    </span>
                    <span className="tabular shrink-0 text-body text-muted">{formatKwh(s.kwh)}</span>
                  </button>
                );
              })}
            </List>
          </Section>
        ))
      )}
      {groups.length > months && (
        <Button variant="ghost" block onClick={() => setMonths((m) => m + 6)}>
          Ältere anzeigen
        </Button>
      )}
      <p className="px-1 text-center text-caption text-subtle">
        {history.sessions.length} Ladevorgänge aus dem go-e Ladeverlauf
        {history.syncedAt ? ` · aktualisiert ${formatRelative(history.syncedAt)}` : ''}
      </p>

      {selecting && picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6 lg:pl-64">
          <Button size="lg" className="shadow-sheet" onClick={() => setAssignOpen(true)}>
            {picked.length} Ladevorgang{picked.length === 1 ? '' : 'e'} zuordnen
          </Button>
        </div>
      )}

      <Sheet open={assignOpen} onClose={() => setAssignOpen(false)} title={`${picked.length} Ladevorgang${picked.length === 1 ? '' : 'e'} zuordnen`}>
        <AssignList
          persons={persons}
          value={null}
          onChange={(key) => {
            store.setSessionOwners(picked, key);
            toast(key ? 'Zuordnung gespeichert' : 'Zuordnung entfernt');
            setAssignOpen(false);
            setSelecting(false);
            setPicked([]);
          }}
        />
      </Sheet>
      <ConfirmSheet
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Alle Vorschläge übernehmen?"
        confirmLabel="Übernehmen"
        onConfirm={() => {
          const byPerson = new Map();
          suggestions.forEach((sug, id) => byPerson.set(sug.key, [...(byPerson.get(sug.key) || []), id]));
          byPerson.forEach((ids, key) => store.setSessionOwners(ids, key));
          toast(`${suggestions.size} Ladevorgänge zugeordnet`);
        }}
      >
        <ul className="space-y-1.5">
          {persons
            .map((p) => ({ p, count: [...suggestions.values()].filter((sug) => sug.key === p.key).length }))
            .filter((x) => x.count > 0)
            .map(({ p, count }) => (
              <li key={p.key} className="flex items-center gap-2 text-ink">
                <PersonDot index={p.colorIndex} />
                {p.name}: {count} Ladevorgang{count === 1 ? '' : 'e'}
              </li>
            ))}
        </ul>
        <p className="mt-3">Du kannst jede Zuordnung später im Ladevorgang ändern.</p>
      </ConfirmSheet>
      <SessionSheet
        suggestion={session ? suggestions.get(session.id) : null}
        powers={powers}
        session={session}
        persons={persons}
        owners={owners}
        price={price.value}
        readOnly={demo}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

// ---------- Abrechnungen ----------

function Breakdown({ users }) {
  if (!users || users.length === 0) return null;
  return (
    <Card padded={false}>
      <div className="px-4 pt-4">
        <SplitBar shares={users.map((u) => u.cost || 0)} colors={users.map((u, i) => (u.name === UNASSIGNED_LABEL ? null : i))} />
      </div>
      <div className="mt-2 divide-y divide-line">
        {users.map((u, i) => (
          <div key={`${u.name}-${i}`} className="flex items-center gap-3 px-4 py-3">
            {u.name === UNASSIGNED_LABEL ? <span className="h-3 w-3 shrink-0 rounded-full bg-subtle" aria-hidden="true" /> : <PersonDot index={i} className="h-3 w-3" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-semibold text-ink">{u.name}</div>
              <div className="tabular text-caption text-muted">
                {formatKwh(u.energyKwh)} · {formatNumber((u.share || 0) * 100, 1)} %
              </div>
            </div>
            <div className="tabular text-headline text-ink">{formatEuro(u.cost)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PeriodSheet({ period, onClose, onEdit, onDelete }) {
  return (
    <Sheet
      open={!!period}
      onClose={onClose}
      title={period ? period.label : ''}
      footer={
        <div className="flex gap-2">
          <Button variant="plain" icon={PencilSquareIcon} block onClick={onEdit}>
            Bearbeiten
          </Button>
          <Button variant="danger" icon={TrashIcon} block onClick={onDelete}>
            Löschen
          </Button>
        </div>
      }
    >
      {period && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Gesamt" value={formatEuro(period.totalCost)} />
            <Stat label="Verbrauch" value={formatKwh(period.chargedKwh, true)} />
            <Stat label="Preis" value={formatPrice(period.pricePerKwh)} />
            <Stat label="Zählerstand" value={typeof period.meterReading === 'number' ? `${formatNumber(period.meterReading, 2)} kWh` : '–'} />
          </div>
          <p className="text-caption text-muted">
            {period.from ? `${formatDate(period.from)} – ` : ''}abgeschlossen am {formatDate(period.createdAt, true)}
            {period.source === 'sessions' ? ' · nach Ladevorgängen' : ' · nach Kartenständen'}
          </p>
          {period.note && <p className="rounded-control bg-surface-2 px-4 py-3 text-body text-ink">{period.note}</p>}
          <Breakdown users={period.userBreakdown} />
        </div>
      )}
    </Sheet>
  );
}

function EditSheet({ period, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({});
  useEffect(() => {
    if (period) {
      setForm({
        label: period.label,
        note: period.note || '',
        kwh: toInput(period.chargedKwh, 2),
        price: toInput(period.pricePerKwh, 3),
        meter: toInput(period.meterReading, 2)
      });
    }
  }, [period]);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const kwh = store.parseNumber(form.kwh);
  const price = store.parseNumber(form.price);
  const valid = kwh > 0 && price > 0;
  return (
    <Sheet
      open={!!period}
      onClose={onClose}
      title="Abrechnung bearbeiten"
      footer={
        <Button
          block
          size="lg"
          disabled={!valid}
          onClick={() => {
            const updated = editPeriod(period, {
              label: form.label,
              note: form.note,
              chargedKwh: kwh,
              pricePerKwh: price,
              meterReading: store.parseNumber(form.meter)
            });
            store.savePeriods(store.getPeriods().map((p) => (p.id === period.id ? updated : p)));
            toast('Änderungen gespeichert');
            onClose();
          }}
        >
          Speichern
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField label="Titel" value={form.label || ''} onChange={set('label')} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Verbrauch" unit="kWh" value={form.kwh || ''} onChange={set('kwh')} />
          <NumberField label="Preis" unit="€/kWh" value={form.price || ''} onChange={set('price')} />
        </div>
        <NumberField label="Zählerstand" unit="kWh" value={form.meter || ''} onChange={set('meter')} />
        <TextField label="Notiz" value={form.note || ''} onChange={set('note')} />
        <p className="text-caption text-muted">Die Anteile der Personen bleiben gleich, Kosten werden neu berechnet.</p>
      </div>
    </Sheet>
  );
}

function SnapshotSheet({ snapshot, onClose, onDelete }) {
  return (
    <Sheet
      open={!!snapshot}
      onClose={onClose}
      title={snapshot ? snapshot.label : ''}
      footer={
        <Button variant="danger" icon={TrashIcon} block onClick={onDelete}>
          Sicherung löschen
        </Button>
      }
    >
      {snapshot && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Gesamt" value={formatEuro(snapshot.totalCost)} />
            <Stat label="Verbrauch" value={formatKwh(snapshot.totalKwh, true)} />
            <Stat label="Preis" value={formatPrice(snapshot.pricePerKwh)} />
            <Stat label="Quelle" value={snapshot.type === 'api' ? 'Wallbox' : snapshot.type === 'meter' ? 'Hauszähler' : 'Abrechnung'} />
          </div>
          <p className="text-caption text-muted">Gesichert am {formatDate(snapshot.createdAt, true)}</p>
          <Breakdown users={snapshot.userBreakdown} />
        </div>
      )}
    </Sheet>
  );
}

function PeriodsView() {
  const toast = useToast();
  const periods = useStored(store.getPeriods);
  const snapshots = useStored(store.getSnapshots);
  const { person } = usePersonFilter();
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [snapId, setSnapId] = useState(null);
  const [snapDeleteId, setSnapDeleteId] = useState(null);
  const [showSnaps, setShowSnaps] = useState(false);

  const open = periods.find((p) => p.id === openId) || null;
  const editing = periods.find((p) => p.id === editId) || null;
  const deleting = periods.find((p) => p.id === deleteId) || null;
  const snap = snapshots.find((s) => s.id === snapId) || null;
  const totals = periodTotals(periods);
  const sum = (list, field) => list.reduce((s, u) => s + (u[field] || 0), 0);
  const personTotal = person ? periods.reduce((total, p) => total + sum(shareOf(p, person), 'cost'), 0) : null;

  return (
    <>
      {periods.length === 0 ? (
        <EmptyState icon={ClockIcon} title="Noch keine Abrechnung" action={<Button to="/abrechnung">Zur Abrechnung</Button>}>
          Wenn du eine Abrechnung abschließt, erscheint sie hier – mit Aufteilung pro Person.
        </EmptyState>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-4">
              {person ? <Stat label={`${person.name} insgesamt`} value={formatEuro(personTotal)} /> : <Stat label="Summe aller Abrechnungen" value={formatEuro(totals.cost)} />}
              {person ? <Stat label="Alle zusammen" value={formatEuro(totals.cost)} /> : <Stat label="Verbrauch" value={formatKwh(totals.kwh)} />}
            </div>
          </Card>
          <Section title="Abrechnungen">
            <List>
              {periods.map((p) => {
                const own = shareOf(p, person);
                return (
                  <ListItem
                    key={p.id}
                    title={p.label}
                    subtitle={`${formatDate(p.createdAt)} · ${formatKwh(own ? sum(own, 'energyKwh') : p.chargedKwh)}`}
                    value={formatEuro(own ? sum(own, 'cost') : p.totalCost)}
                    onClick={() => setOpenId(p.id)}
                  />
                );
              })}
            </List>
          </Section>
        </>
      )}

      {snapshots.length > 0 && (
        <Section title="Alte Sicherungen" footer="Zwischenstände aus Wall-E 1. Neue Sicherungen machst du unter Einstellungen → Teilen & Sichern.">
          <List>
            {showSnaps ? (
              snapshots.map((s) => (
                <ListItem
                  key={s.id}
                  icon={ArchiveBoxIcon}
                  iconTone="neutral"
                  title={s.label}
                  subtitle={formatDate(s.createdAt)}
                  value={formatEuro(s.totalCost)}
                  onClick={() => setSnapId(s.id)}
                />
              ))
            ) : (
              <ListItem
                icon={ArchiveBoxIcon}
                iconTone="neutral"
                title={`${snapshots.length} Sicherung${snapshots.length === 1 ? '' : 'en'} anzeigen`}
                onClick={() => setShowSnaps(true)}
              />
            )}
          </List>
        </Section>
      )}

      <PeriodSheet
        period={open}
        onClose={() => setOpenId(null)}
        onEdit={() => {
          setEditId(openId);
          setOpenId(null);
        }}
        onDelete={() => {
          setDeleteId(openId);
          setOpenId(null);
        }}
      />
      <EditSheet period={editing} onClose={() => setEditId(null)} />
      <ConfirmSheet
        open={!!deleting}
        onClose={() => setDeleteId(null)}
        title="Abrechnung löschen?"
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          const result = deletePeriod(store.getPeriods(), deleteId);
          store.savePeriods(result.periods, result.baseline);
          toast('Abrechnung gelöscht');
        }}
      >
        „{deleting && deleting.label}“ wird entfernt. Ist es die neueste, zählt die laufende Abrechnung wieder ab dem Abschluss davor – nichts geht verloren.
      </ConfirmSheet>
      <SnapshotSheet
        snapshot={snap}
        onClose={() => setSnapId(null)}
        onDelete={() => {
          setSnapDeleteId(snapId);
          setSnapId(null);
        }}
      />
      <ConfirmSheet
        open={!!snapDeleteId}
        onClose={() => setSnapDeleteId(null)}
        title="Sicherung löschen?"
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          store.deleteSnapshot(snapDeleteId);
          toast('Sicherung gelöscht');
        }}
      >
        Die alte Sicherung wird entfernt. Deine Abrechnungen bleiben unverändert.
      </ConfirmSheet>
    </>
  );
}

export default function HistoryPage() {
  const { active, demo } = useStatus();
  const history = useHistory();
  const [params, setParams] = useSearchParams();
  const view = params.get('ansicht') || (history.available || history.link ? 'ladungen' : 'abrechnungen');
  const setView = (v) => setParams(v === 'ladungen' ? {} : { ansicht: v }, { replace: true });

  return (
    <Page title="Verlauf" action={<PersonPicker />}>
      {demo && <DemoBanner />}
      <Segmented
        label="Ansicht"
        value={view === 'abrechnungen' ? 'abrechnungen' : 'ladungen'}
        onChange={setView}
        options={[
          { value: 'ladungen', label: 'Ladevorgänge' },
          { value: 'abrechnungen', label: 'Abrechnungen' }
        ]}
      />
      {view === 'abrechnungen' ? (
        <PeriodsView />
      ) : active ? (
        <SessionsView
          filter={view === 'offen' ? 'open' : view === 'meine' ? 'mine' : 'all'}
          setFilter={(f) => setView(f === 'open' ? 'offen' : f === 'mine' ? 'meine' : 'ladungen')}
        />
      ) : (
        <EmptyState icon={ClockIcon} title="Noch keine Wallbox verbunden" action={<Button to="/einstellungen/wallbox">Wallbox verbinden</Button>} />
      )}
    </Page>
  );
}
