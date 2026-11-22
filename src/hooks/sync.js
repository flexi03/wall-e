// „Gemeinsam nutzen“ in der App: eigene Änderungen verschicken, fremde abholen,
// automatisch übernehmen oder im Posteingang zum Übernehmen/Ablehnen anbieten.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as store from '../lib/storage.js';
import { ackChanges, applySnapshot, flushOutbox, join, pullChanges, queueLocalChange } from '../lib/sync.js';
import { useStored } from './data.js';
import { useToast } from '../components/ui.jsx';
import { myName } from '../lib/syncText.js';

const REFRESH_MS = 30000;
const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const sync = useStored(store.getSync);
  const inbox = useStored(store.getSyncInbox);
  const toast = useToast();
  const [state, setState] = useState({ busy: false, error: '', at: null });
  const running = useRef(false);
  const decided = useRef(new Set()); // gerade entschieden – nicht erneut anbieten, falls der Server noch nachhinkt
  const key = sync ? `${sync.key}:${sync.device}` : '';

  const run = useCallback(async () => {
    if (!store.getSync() || running.current) return;
    running.current = true;
    setState((s) => ({ ...s, busy: true }));
    try {
      await flushOutbox();
      const changes = await pullChanges();
      const me = store.getSync();
      const done = [];
      const waiting = store.getSyncInbox();
      for (const change of changes) {
        if ((change.by && change.by.device === me.device) || decided.current.has(change.id)) {
          done.push(change.id);
        } else if (me.auto && change.type !== 'snapshot') {
          const applied = store.applyRemote(change);
          done.push(change.id);
          toast(applied ? change.text : `${change.text} – älter als dein Stand, nicht übernommen`);
        } else if (!waiting.some((c) => c.id === change.id)) {
          waiting.push(change);
        }
      }
      store.setSyncInbox(waiting);
      await ackChanges(done);
      setState({ busy: false, error: '', at: new Date().toISOString() });
    } catch (error) {
      setState((s) => ({ ...s, busy: false, error: error.message }));
    } finally {
      running.current = false;
    }
  }, [toast]);

  // Name geändert („Das bin ich“) → neu anmelden, damit die anderen ihn in der Geräteliste sehen
  const name = useStored(myName);
  useEffect(() => {
    if (key) join().catch(() => {});
  }, [key, name]);

  // Eigene Änderungen sammeln und kurz danach senden
  useEffect(() => {
    let timer = null;
    const off = store.onLocalChange((type, data) => {
      queueLocalChange(type, data);
      clearTimeout(timer);
      timer = setTimeout(run, 1500);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [run]);

  // Anmelden, sobald eingerichtet; danach regelmäßig, beim Zurückkehren und nach einem Push abgleichen
  useEffect(() => {
    if (!key) return undefined;
    let timer = null;
    join()
      .catch(() => {})
      .finally(run);
    const tick = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = setTimeout(() => run().finally(tick), REFRESH_MS);
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        run();
        tick();
      }
    };
    const onMessage = (event) => event.data && event.data.type === 'wall-e-sync' && run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [key, run]);

  const decide = useCallback(
    async (ids, accept) => {
      const list = store.getSyncInbox();
      const chosen = list.filter((c) => ids.includes(c.id));
      chosen.forEach((c) => decided.current.add(c.id));
      let skipped = 0;
      if (accept) {
        chosen.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).forEach((change) => {
          if (!(change.type === 'snapshot' ? applySnapshot(change) : store.applyRemote(change))) skipped += 1;
        });
      }
      store.setSyncInbox(list.filter((c) => !ids.includes(c.id)));
      try {
        await ackChanges(chosen.map((c) => c.id));
      } catch {
        // wird beim nächsten Abgleich erneut gemeldet und dann erledigt
      }
      if (accept) toast(skipped ? `Übernommen – ${skipped} davon war älter als dein Stand` : chosen.length === 1 ? 'Übernommen' : `${chosen.length} Änderungen übernommen`);
      else toast(chosen.length === 1 ? 'Abgelehnt' : `${chosen.length} Änderungen abgelehnt`);
    },
    [toast]
  );

  const value = useMemo(() => ({ sync, inbox, ...state, refresh: run, accept: (ids) => decide(ids, true), reject: (ids) => decide(ids, false) }), [sync, inbox, state, run, decide]);
  return createElement(SyncContext.Provider, { value }, children);
}

export const useSync = () => useContext(SyncContext);
