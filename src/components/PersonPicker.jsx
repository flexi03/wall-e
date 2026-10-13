// Auswahl "Alle" oder eine Person – oben rechts auf Live, Abrechnung und Verlauf
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, UsersIcon, CheckIcon } from '@heroicons/react/20/solid';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { Sheet, PersonDot, Button } from './ui.jsx';
import { usePeople, usePersonFilter } from '../hooks/data.js';

export default function PersonPicker() {
  const navigate = useNavigate();
  const { persons, me } = usePeople();
  const { person, selected, setSelected } = usePersonFilter();
  const [open, setOpen] = useState(false);
  if (persons.length === 0) return null;

  const choose = (key) => {
    setSelected(key);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 max-w-[11rem] items-center gap-1.5 rounded-full bg-surface-2 pl-3 pr-2 text-caption font-semibold text-ink transition-colors hover:brightness-95 dark:hover:brightness-125"
        aria-label={`Ansicht: ${person ? person.name : 'Alle'} – ändern`}
      >
        {person ? <PersonDot index={person.colorIndex} /> : <UsersIcon className="h-4 w-4 text-muted" aria-hidden="true" />}
        <span className="truncate">{person ? person.name : 'Alle'}</span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Ansicht für"
        footer={
          <Button
            variant="plain"
            icon={UserGroupIcon}
            block
            onClick={() => {
              setOpen(false);
              navigate('/einstellungen/personen');
            }}
          >
            Personen verwalten
          </Button>
        }
      >
        <div className="-mx-5 divide-y divide-line border-y border-line">
          {[{ key: null, name: 'Alle' }, ...persons].map((p) => (
            <button
              key={p.key || 'all'}
              type="button"
              onClick={() => choose(p.key)}
              className="flex min-h-[3.25rem] w-full items-center gap-3 px-5 text-left text-body text-ink hover:bg-surface-2"
            >
              {p.key ? <PersonDot index={p.colorIndex} className="h-3 w-3" /> : <UsersIcon className="h-4 w-4 text-muted" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate">
                {p.name}
                {p.key && p.key === me && <span className="ml-2 text-caption text-muted">Ich</span>}
                {p.key && !p.isProfile && <span className="ml-2 text-caption text-muted">Karte</span>}
              </span>
              {selected === p.key && <CheckIcon className="h-5 w-5 text-primary" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
