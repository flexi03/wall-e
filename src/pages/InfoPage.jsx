import React from 'react';
import { DevicePhoneMobileIcon, ServerIcon, NoSymbolIcon, EnvelopeIcon, GlobeAltIcon, DocumentTextIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { Page, Section, Card, List, ListItem } from '../components/ui.jsx';
import packageInfo from '../../package.json';
import site from '@site';

const contact = site.contact || {};

const FAQ = [
  {
    q: 'Wie wird aufgeteilt?',
    a: 'Jede RFID-Karte steht für eine Person. Wall-E nimmt den Verbrauch jeder Karte seit dem Start der Abrechnung, rechnet den Ladeverlust ein und multipliziert mit deinem Strompreis.'
  },
  {
    q: 'Was ist der Ladeverlust?',
    a: 'Der Hauszähler misst mehr als die Wallbox, weil beim Laden Energie verloren geht. Trägst du Zählerstände ein, nutzt Wall-E den echten Wert. Sonst gelten pauschal 1,8 %.'
  },
  {
    q: '„Wallbox nicht erreichbar“?',
    a: 'Prüfe Seriennummer und Token, und ob die Cloud-API in der go-e App eingeschaltet ist. Ist die Wallbox offline, zeigt Wall-E den letzten bekannten Stand.'
  },
  {
    q: 'Daten auf ein neues Handy bringen?',
    a: 'Einstellungen → Teilen & Sichern: Link, QR-Code oder Datei erstellen und auf dem neuen Gerät unter „Daten übernehmen“ einlesen.'
  }
];

export default function InfoPage() {
  return (
    <Page title="Hilfe & Datenschutz" back={{ to: '/einstellungen', label: 'Einstellungen' }}>
      <Section title="Häufige Fragen">
        <Card padded={false} className="divide-y divide-line">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-4">
              <summary className="flex min-h-[3.25rem] cursor-pointer list-none items-center justify-between gap-3 text-body font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="text-subtle transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="pb-4 text-body text-muted">{item.a}</p>
            </details>
          ))}
        </Card>
      </Section>

      <Section title="Datenschutz">
        <List>
          <ListItem icon={DevicePhoneMobileIcon} iconTone="success" title="Alles bleibt auf deinem Gerät" subtitle="Kein Konto, keine Datenbank" chevron={false} />
          <ListItem icon={ServerIcon} title="Abfragen über den Wall-E-Server" subtitle="Weitergeleitet an go-e, nichts gespeichert" chevron={false} />
          <ListItem icon={NoSymbolIcon} iconTone="neutral" title="Kein Tracking, keine Cookies" chevron={false} />
        </List>
        <p className="mt-2 px-1 text-caption text-muted">
          Browser dürfen die go-e Cloud nicht direkt abfragen. Deshalb leitet der Wall-E-Server deine Anfrage verschlüsselt weiter. Seriennummer und Token stehen dabei nie in der Adresse und werden nicht gespeichert.
        </p>
      </Section>

      {(contact.email || contact.website || contact.imprint || contact.privacy) && (
        <Section title="Kontakt">
          <List>
            {contact.email && <ListItem icon={EnvelopeIcon} title={contact.email} href={`mailto:${contact.email}`} />}
            {contact.website && <ListItem icon={GlobeAltIcon} title={contact.website.replace(/^https?:\/\//, '')} href={contact.website} />}
            {contact.imprint && <ListItem icon={DocumentTextIcon} iconTone="neutral" title="Impressum" href={contact.imprint} />}
            {contact.privacy && <ListItem icon={ShieldCheckIcon} iconTone="neutral" title="Datenschutzerklärung" href={contact.privacy} />}
          </List>
        </Section>
      )}

      <p className="text-center text-caption text-subtle">
        Wall-E {packageInfo.version} · go-e Firmware 052 oder neuer mit aktivierter Cloud-API
      </p>
    </Page>
  );
}
