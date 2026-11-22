// Änderungen anderer Geräte, die noch auf eine Entscheidung warten (nur wenn „automatisch übernehmen“ aus ist).
// Steht oben auf jeder Seite, bis alles übernommen oder abgelehnt ist.
import React, { useState } from 'react';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { Card, Button } from './ui.jsx';
import { useSync } from '../hooks/sync.js';
import { formatRelative } from '../lib/format.js';

export default function SyncInbox() {
  const sync = useSync();
  const [open, setOpen] = useState(false);
  if (!sync || !sync.sync || sync.inbox.length === 0) return null;
  const { inbox, accept, reject } = sync;
  const list = open ? inbox : inbox.slice(0, 2);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 md:px-6 lg:max-w-4xl lg:px-8 lg:pt-8">
      <Card padded={false} className="border border-primary/30">
        <div className="flex items-center gap-3 px-4 pt-3">
          <ArrowsRightLeftIcon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-body font-semibold text-ink">
            {inbox.length === 1 ? 'Neue Änderung von einem anderen Gerät' : `${inbox.length} Änderungen von anderen Geräten`}
          </span>
          {inbox.length > 1 && (
            <Button size="sm" variant="plain" onClick={() => accept(inbox.map((c) => c.id))}>
              Alle übernehmen
            </Button>
          )}
        </div>
        <div className="divide-y divide-line">
          {list.map((change) => (
            <div key={change.id} className="px-4 py-3">
              <p className="text-body text-ink">{change.text}</p>
              <p className="text-caption text-muted">{formatRelative(change.at)}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => accept([change.id])}>
                  Übernehmen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => reject([change.id])}>
                  Ablehnen
                </Button>
              </div>
            </div>
          ))}
        </div>
        {inbox.length > 2 && (
          <button type="button" className="min-h-11 w-full border-t border-line text-caption font-semibold text-primary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Weniger anzeigen' : `Alle ${inbox.length} anzeigen`}
          </button>
        )}
      </Card>
    </div>
  );
}
