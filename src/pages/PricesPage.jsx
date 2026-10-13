import React, { useEffect, useState } from 'react';
import { PlusIcon, TrashIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Page, Section, Card, List, ListItem, Button, Sheet, ConfirmSheet, NumberField, TextField, Badge, useToast } from '../components/ui.jsx';
import { useStored } from '../hooks/data.js';
import * as store from '../lib/storage.js';
import { formatPrice, formatDate, toInput } from '../lib/format.js';

// Neuer Tarif (entry = null) oder vorhandenen bearbeiten, aktivieren, löschen
function PriceSheet({ open, entry, isActive, onClose, onDelete }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [price, setPrice] = useState('');
  useEffect(() => {
    if (open) {
      setLabel(entry ? entry.label : '');
      setPrice(entry ? toInput(entry.price, 3) : '');
    }
  }, [open, entry]);
  const n = store.parseNumber(price);
  const valid = n > 0 && n < 10;

  const save = () => {
    if (entry) {
      store.updatePrice(entry.id, { label: label.trim() || entry.label, price: n });
      if (isActive) store.setActivePrice(n);
      toast('Tarif gespeichert');
    } else {
      store.addPrice(label, n);
      toast('Neuer Strompreis aktiv');
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={entry ? 'Tarif' : 'Neuer Strompreis'}
      footer={
        <div className="space-y-2">
          {entry && !isActive && (
            <Button
              block
              size="lg"
              icon={CheckCircleIcon}
              onClick={() => {
                store.setActivePrice(entry.price);
                toast(`${formatPrice(entry.price)} ist jetzt aktiv`);
                onClose();
              }}
            >
              Diesen Preis verwenden
            </Button>
          )}
          <div className="flex gap-2">
            {entry && (
              <Button variant="danger" icon={TrashIcon} block onClick={onDelete}>
                Löschen
              </Button>
            )}
            <Button variant={entry && !isActive ? 'plain' : 'primary'} size={entry ? 'md' : 'lg'} block disabled={!valid} onClick={save}>
              {entry ? 'Änderungen speichern' : 'Hinzufügen und verwenden'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <NumberField
          label="Preis"
          unit="€/kWh"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="z. B. 0,35"
          error={price && !valid ? 'Bitte Euro pro kWh eingeben, z. B. 0,35' : ''}
        />
        <TextField label="Anbieter / Tarif (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Stadtwerke 2026" />
      </div>
    </Sheet>
  );
}

export default function PricesPage() {
  const toast = useToast();
  const price = useStored(store.getPrice);
  const history = useStored(store.getPriceHistory);
  const [sheet, setSheet] = useState(null); // null | 'new' | Tarif
  const [deleting, setDeleting] = useState(null);
  const entry = sheet && sheet !== 'new' ? sheet : null;

  return (
    <Page title="Strompreis" back={{ to: '/einstellungen', label: 'Einstellungen' }}>
      <Card>
        <div className="text-caption text-muted">Aktiver Preis</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="tabular text-display text-ink">{price.value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</span>
          <span className="text-headline text-muted">€/kWh</span>
        </div>
        {!price.isSet && <p className="mt-2 text-caption text-warning">Noch nicht gesetzt – gerechnet wird mit diesem Standardwert.</p>}
        <Button className="mt-5" variant="secondary" icon={PlusIcon} block onClick={() => setSheet('new')}>
          Neuer Strompreis
        </Button>
      </Card>

      {history.length > 0 && (
        <Section title="Tarife" footer="Abgeschlossene Abrechnungen behalten den Preis, mit dem sie abgeschlossen wurden.">
          <List>
            {history.map((item) => (
              <ListItem key={item.id} title={item.label} subtitle={formatDate(item.createdAt)} value={formatPrice(item.price)} onClick={() => setSheet(item)}>
                {item.price === price.value && <Badge tone="success">aktiv</Badge>}
              </ListItem>
            ))}
          </List>
        </Section>
      )}

      <PriceSheet
        open={sheet !== null}
        entry={entry}
        isActive={!!entry && entry.price === price.value}
        onClose={() => setSheet(null)}
        onDelete={() => {
          setDeleting(entry);
          setSheet(null);
        }}
      />
      <ConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Tarif löschen?"
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          store.deletePrice(deleting.id);
          toast('Tarif gelöscht');
        }}
      >
        „{deleting && deleting.label}“ wird aus der Liste entfernt. Der aktive Preis und alle Abrechnungen bleiben unverändert.
      </ConfirmSheet>
    </Page>
  );
}
