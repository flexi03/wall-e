import React, { useEffect, useState } from 'react';
import { PlusIcon, TrashIcon, UserIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/20/solid';
import { Page, Section, Card, List, ListItem, Button, Sheet, ConfirmSheet, TextField, NumberField, Checkbox, PersonDot, useToast } from '../components/ui.jsx';
import { personPowers } from '../lib/suggest.js';
import { formatNumber, toInput } from '../lib/format.js';
import { usePeople, useStatus, useHistory } from '../hooks/data.js';
import * as store from '../lib/storage.js';

// Profil anlegen/bearbeiten. draft = { id?, name, cards }
function ProfileSheet({ draft, onClose, onDelete }) {
  const toast = useToast();
  const { cardNames, profiles, me, persons, owners } = usePeople();
  const { sessions } = useHistory();
  const [name, setName] = useState('');
  const [power, setPower] = useState('');
  const [cards, setCards] = useState([]);
  const [isMe, setIsMe] = useState(false);
  useEffect(() => {
    if (draft) {
      setName(draft.name || '');
      setCards(draft.cards || []);
      setPower(toInput(draft.chargeKw, 1));
      setIsMe(!!draft.id && draft.id === me);
    }
  }, [draft, me]);
  if (!draft) return null;
  const powerValue = store.parseNumber(power);
  const powerError = power && !(powerValue > 0 && powerValue <= 50) ? 'Bitte kW eingeben, z. B. 3,7 oder 11' : '';
  // Gelernter Wert für dieses Profil (aus seinen Karten bzw. zugeordneten Ladevorgängen)
  const learned = draft.id
    ? personPowers(
        persons.map((p) => (p.key === draft.id ? { ...p, chargeKw: null } : p)),
        sessions,
        owners
      ).get(draft.id)
    : null;

  const otherOwner = (card) => profiles.find((p) => p.id !== draft.id && p.cards.includes(card));
  const save = () => {
    const profile = {
      id: draft.id || store.newProfileId(),
      name: name.trim(),
      cards,
      ...(powerValue > 0 ? { chargeKw: powerValue } : {}),
      createdAt: draft.createdAt || new Date().toISOString()
    };
    store.saveProfile(profile);
    if (isMe) store.setMe(profile.id);
    else if (me === profile.id) store.setMe(null);
    toast(draft.id ? 'Profil gespeichert' : 'Profil angelegt');
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={draft.id ? 'Profil bearbeiten' : 'Neues Profil'}
      footer={
        <div className="flex gap-2">
          {draft.id && (
            <Button variant="danger" icon={TrashIcon} onClick={onDelete} aria-label="Profil löschen">
              Löschen
            </Button>
          )}
          <Button block size="lg" disabled={!name.trim() || !!powerError} onClick={save}>
            Speichern
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Alex" autoComplete="off" />
        <div>
          <h3 className="mb-1.5 px-1 text-caption font-semibold text-muted">RFID-Karten</h3>
          {cardNames.length === 0 ? (
            <p className="px-1 text-body text-muted">Noch keine Karten bekannt – sie erscheinen, sobald die Wallbox erreichbar ist.</p>
          ) : (
            <List>
              {cardNames.map((card) => {
                const other = otherOwner(card);
                return (
                  <Checkbox
                    key={card}
                    checked={cards.includes(card)}
                    onChange={(checked) => setCards((list) => (checked ? [...list, card] : list.filter((c) => c !== card)))}
                    title={card}
                    subtitle={other ? `gehört zu ${other.name} – wird verschoben` : undefined}
                  />
                );
              })}
            </List>
          )}
          <p className="mt-2 px-1 text-caption text-muted">Ladevorgänge dieser Karten zählen automatisch für das Profil. Einzelne Ladevorgänge ordnest du im Verlauf zu.</p>
        </div>
        <NumberField
          label="Ladeleistung des Autos (optional)"
          unit="kW"
          value={power}
          onChange={(e) => setPower(e.target.value)}
          placeholder={learned ? formatNumber(learned.kw, 1) : 'z. B. 3,7 oder 11'}
          error={powerError}
          hint={
            learned
              ? `Gelernt aus ${learned.samples} Ladevorgängen: ca. ${formatNumber(learned.kw, 1)} kW. Leer lassen, um diesen Wert zu nutzen.`
              : 'Einphasig ≈ 3,7 kW, dreiphasig ≈ 11 kW. Damit schlägt Wall-E Ladevorgänge ohne Karte passend vor.'
          }
        />
        <List>
          <Checkbox checked={isMe} onChange={setIsMe} title="Das bin ich" subtitle="Auf diesem Gerät wird beim Öffnen dieses Profil angezeigt" />
        </List>
      </div>
    </Sheet>
  );
}

function MeSheet({ open, onClose }) {
  const { persons, me } = usePeople();
  return (
    <Sheet open={open} onClose={onClose} title="Das bin ich">
      <p className="mb-3 text-body text-muted">Diese Person ist auf diesem Gerät vorausgewählt. Gilt nur hier und wird nicht geteilt.</p>
      <div className="-mx-5 divide-y divide-line border-y border-line">
        {[{ key: null, name: 'Niemand (immer „Alle“)' }, ...persons].map((p) => (
          <button
            key={p.key || 'none'}
            type="button"
            onClick={() => {
              store.setMe(p.key);
              onClose();
            }}
            className="flex min-h-[3.25rem] w-full items-center gap-3 px-5 text-left text-body text-ink hover:bg-surface-2"
          >
            {p.key ? <PersonDot index={p.colorIndex} className="h-3 w-3" /> : <span className="h-3 w-3" />}
            <span className="flex-1 truncate">{p.name}</span>
            {(me || null) === p.key && <CheckIcon className="h-5 w-5 text-primary" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export default function PeoplePage() {
  const toast = useToast();
  const { demo } = useStatus();
  const { persons, profiles, me } = usePeople();
  const [draft, setDraft] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [meOpen, setMeOpen] = useState(false);
  const mePerson = persons.find((p) => p.key === me);
  const looseCards = persons.filter((p) => !p.isProfile);

  return (
    <Page title="Personen" back={{ to: '/einstellungen', label: 'Einstellungen' }}>
      <Section title="Dieses Gerät">
        <List>
          <ListItem icon={UserIcon} title="Das bin ich" value={mePerson ? mePerson.name : 'Niemand'} onClick={() => setMeOpen(true)} />
        </List>
      </Section>

      <Section title="Profile" footer="Ein Profil fasst mehrere RFID-Karten und einzeln zugeordnete Ladevorgänge zu einer Person zusammen.">
        {profiles.length > 0 && (
          <List className="mb-3">
            {persons
              .filter((p) => p.isProfile)
              .map((p) => (
                <ListItem
                  key={p.key}
                  title={
                    <span className="flex items-center gap-2">
                      <PersonDot index={p.colorIndex} />
                      {p.name}
                    </span>
                  }
                  subtitle={[p.cards.length ? p.cards.join(', ') : 'Keine Karte', p.chargeKw ? `${formatNumber(p.chargeKw, 1)} kW` : null].filter(Boolean).join(' · ')}
                  value={p.key === me ? 'Ich' : undefined}
                  onClick={demo ? undefined : () => setDraft(profiles.find((x) => x.id === p.key))}
                />
              ))}
          </List>
        )}
        <Button variant="secondary" icon={PlusIcon} block disabled={demo} onClick={() => setDraft({ name: '', cards: [] })}>
          Neues Profil
        </Button>
      </Section>

      {looseCards.length > 0 && (
        <Section title="Karten ohne Profil" footer="Diese Karten erscheinen als eigene Person. Tippe auf eine Karte, um daraus ein Profil zu machen.">
          <List>
            {looseCards.map((p) => (
              <ListItem key={p.key} icon={CreditCardIcon} iconTone="neutral" title={p.name} onClick={demo ? undefined : () => setDraft({ name: p.name, cards: p.cards })} />
            ))}
          </List>
        </Section>
      )}

      {demo && (
        <Card>
          <p className="text-body text-muted">Im Demo-Modus können keine Profile angelegt werden.</p>
        </Card>
      )}

      <ProfileSheet
        draft={draft}
        onClose={() => setDraft(null)}
        onDelete={() => {
          setDeleting(draft);
          setDraft(null);
        }}
      />
      <MeSheet open={meOpen} onClose={() => setMeOpen(false)} />
      <ConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Profil löschen?"
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          store.deleteProfile(deleting.id);
          toast('Profil gelöscht');
        }}
      >
        „{deleting && deleting.name}“ wird entfernt. Seine Karten erscheinen wieder einzeln, von Hand zugeordnete Ladevorgänge gelten wieder als nicht zugeordnet. Abgeschlossene
        Abrechnungen bleiben unverändert.
      </ConfirmSheet>
    </Page>
  );
}
