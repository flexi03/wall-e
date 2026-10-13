// Hooks, die Seiten mit Daten versorgen
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as store from '../lib/storage.js';
import { fetchStatus, demoStatus } from '../lib/goe.js';
import { computeCurrentPeriod } from '../lib/billing.js';
import { syncSessions, demoSessions } from '../lib/history.js';
import { buildPersons, cardNamesFrom, computeFromSessions, groupCardsByPerson, periodStart } from '../lib/people.js';

// Version, die sich bei jeder gespeicherten Änderung erhöht → Komponenten lesen neu
let version = 0;
store.subscribe(() => {
  version += 1;
});
const getVersion = () => version;

export function useStored(read) {
  const v = useSyncExternalStore(store.subscribe, getVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(read, [v]);
}

// ---------- Live-Status der Wallbox ----------
//
// Abfrage alle 30 s, solange die App sichtbar ist. Kurze Aussetzer der go-e Cloud (5xx, Zeitüberschreitung)
// werden still wiederholt; der letzte Stand bleibt sichtbar. Ein Fehler wird erst nach zwei Fehlversuchen
// in Folge gezeigt – oder sofort, wenn noch gar keine Daten da sind bzw. der Fehler nicht vorübergehend ist.

const REFRESH_MS = 30000;
const MAX_BACKOFF_MS = 5 * 60000;
const StatusContext = createContext(null);

export function StatusProvider({ children }) {
  const wallbox = useStored(store.getWallbox);
  const demo = useStored(store.isDemoMode);
  const active = demo || wallbox.isConfigured;
  const [state, setState] = useState({ status: null, error: '', loading: false, updatedAt: null, failures: 0 });
  const inFlight = useRef(false);
  const failures = useRef(0);
  const timer = useRef(null);
  const credentials = useRef(wallbox);
  credentials.current = wallbox;

  const schedule = useRef(() => {});

  const refresh = useCallback(async () => {
    if (!active || inFlight.current) return;
    inFlight.current = true;
    clearTimeout(timer.current);
    setState((s) => ({ ...s, loading: true }));
    try {
      const status = demo ? demoStatus() : await fetchStatus(credentials.current);
      failures.current = 0;
      setState({ status, error: '', loading: false, updatedAt: new Date().toISOString(), failures: 0 });
    } catch (error) {
      failures.current += 1;
      setState((s) => ({
        ...s,
        loading: false,
        failures: failures.current,
        error: !error.transient || failures.current >= 2 || !s.status ? error.message : s.error
      }));
    } finally {
      inFlight.current = false;
      schedule.current();
    }
  }, [active, demo, wallbox.serial, wallbox.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nächste Abfrage planen: normal 30 s, nach Fehlern länger (60 s, 120 s, … max. 5 min)
  schedule.current = () => {
    clearTimeout(timer.current);
    if (!active || document.visibilityState !== 'visible') return;
    const delay = failures.current === 0 ? REFRESH_MS : Math.min(REFRESH_MS * 2 ** failures.current, MAX_BACKOFF_MS);
    timer.current = setTimeout(refresh, delay);
  };

  // Bei Zugangsänderung neu laden; alte Daten verwerfen
  useEffect(() => {
    failures.current = 0;
    setState({ status: null, error: '', loading: false, updatedAt: null, failures: 0 });
    if (active) refresh();
    return () => clearTimeout(timer.current);
  }, [refresh, active]);

  // Zurück in die App → sofort aktualisieren; im Hintergrund pausieren
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        failures.current = Math.min(failures.current, 1);
        refresh();
      } else {
        clearTimeout(timer.current);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh, active, demo, wallbox }), [state, refresh, active, demo, wallbox]);
  return createElement(StatusContext.Provider, { value }, createElement(HistoryProvider, null, children));
}

export const useStatus = () => useContext(StatusContext);

// ---------- Ladeverlauf ----------

const HISTORY_MIN_INTERVAL = 5 * 60000;
const HistoryContext = createContext(null);

function HistoryProvider({ children }) {
  const { status, active, demo } = useStatus();
  const cached = useStored(store.getCachedSessions);
  const cachedAt = useStored(() => store.getRaw(store.KEYS.sessionsAt));
  const manualLink = useStored(store.getHistoryLink);
  const link = (status && status.historyLink) || manualLink || '';
  const [state, setState] = useState({ loading: false, error: '' });
  const busy = useRef(false);

  const sync = useCallback(
    async (force = false) => {
      if (demo || !active || !link || busy.current) return;
      if (!force && cachedAt && Date.now() - Date.parse(cachedAt) < HISTORY_MIN_INTERVAL) return;
      busy.current = true;
      setState({ loading: true, error: '' });
      try {
        const sessions = await syncSessions(link, store.getCachedSessions());
        store.setCachedSessions(sessions);
        setState({ loading: false, error: '' });
      } catch (error) {
        setState({ loading: false, error: error.message });
      } finally {
        busy.current = false;
      }
    },
    [demo, active, link, cachedAt]
  );

  useEffect(() => {
    sync();
  }, [sync]);

  const demoList = useMemo(() => (demo ? demoSessions() : null), [demo]);
  const value = useMemo(
    () => ({
      sessions: demo ? demoList : cached,
      available: demo || cached.length > 0,
      link,
      syncedAt: demo ? new Date().toISOString() : cachedAt,
      loading: state.loading,
      error: state.error,
      sync
    }),
    [demo, demoList, cached, link, cachedAt, state, sync]
  );
  return createElement(HistoryContext.Provider, { value }, children);
}

export const useHistory = () => useContext(HistoryContext);

// ---------- Personen ----------

const DEMO_PEOPLE = { profiles: [{ id: 'demo-alex', name: 'Alex', cards: ['Alex'], chargeKw: 3.7 }, { id: 'demo-sam', name: 'Sam', cards: ['Sam'] }], owners: {}, unassignedMode: 'separate' };

export function usePeople() {
  const { status, demo } = useStatus();
  const { sessions } = useHistory();
  const stored = useStored(() => ({ profiles: store.getProfiles(), owners: store.getSessionOwners(), unassignedMode: store.getUnassignedMode(), me: store.getMe() }));
  const source = demo ? { ...DEMO_PEOPLE, me: stored.me && stored.me.startsWith('demo') ? stored.me : null } : stored;
  const cardNames = useMemo(() => cardNamesFrom(status ? status.cards : [], sessions), [status, sessions]);
  const persons = useMemo(() => buildPersons(source.profiles, cardNames), [source.profiles, cardNames]);
  return { ...source, cardNames, persons };
}

// Ausgewählte Person ("Alle" = null). Startet mit dem Profil dieses Geräts.
const FilterContext = createContext(null);

export function PersonFilterProvider({ children }) {
  const me = useStored(store.getMe);
  const [selected, setSelected] = useState(me || null);
  useEffect(() => {
    setSelected(me || null);
  }, [me]);
  const value = useMemo(() => ({ selected, setSelected }), [selected]);
  return createElement(FilterContext.Provider, { value }, children);
}

export function usePersonFilter() {
  const { selected, setSelected } = useContext(FilterContext);
  const { persons } = usePeople();
  // Gelöschte oder unbekannte Person → "Alle"
  const person = persons.find((p) => p.key === selected) || null;
  return { selected: person ? person.key : null, person, setSelected };
}

// ---------- Laufende Abrechnung ----------

// Im Demo-Modus mit festen Beispielwerten, damit echte Daten unberührt bleiben
const DEMO_BILLING = {
  baseline: { totalEnergyKwh: 2010, meterReading: 6120, cards: { Alex: 1600.2, Sam: 380.1 }, at: new Date(Date.now() - 20 * 86400000).toISOString() },
  meters: { start: 6120, current: 6290.4, startAt: new Date(Date.now() - 20 * 86400000).toISOString(), currentAt: new Date().toISOString() },
  price: { value: 0.34, isSet: true },
  periods: []
};

export function useBilling() {
  const { status, demo } = useStatus();
  const history = useHistory();
  const { persons, owners, unassignedMode } = usePeople();
  const stored = useStored(() => ({ baseline: store.getBaseline(), meters: store.getMeters(), price: store.getPrice(), periods: store.getPeriods() }));
  const source = demo ? DEMO_BILLING : stored;
  const from = useMemo(() => periodStart(source.baseline, source.periods, source.meters), [source]);

  const current = useMemo(() => {
    // Mit Ladeverlauf: pro Ladevorgang. Sonst wie V1 über die Kartenstände (braucht den Live-Status).
    if (history.available) {
      const result = computeFromSessions({ sessions: history.sessions, persons, owners, from, meters: source.meters, price: source.price.value, unassignedMode });
      return status ? { ...result, totals: computeCurrentPeriod({ cards: status.cards, baseline: source.baseline, meters: source.meters, price: source.price.value }).totals } : result;
    }
    if (!status) return null;
    return groupCardsByPerson(computeCurrentPeriod({ cards: status.cards, baseline: source.baseline, meters: source.meters, price: source.price.value }), persons);
  }, [history.available, history.sessions, persons, owners, from, source, unassignedMode, status]);

  return { ...source, from, current, demo };
}

// ---------- Darstellung ----------

export function useThemeEffect() {
  const pref = useStored(store.getThemePreference);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#0a0c10' : '#f3f4f7');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [pref]);
  return pref;
}
