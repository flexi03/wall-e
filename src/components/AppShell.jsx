// Rahmen der App: unten Tab-Leiste (Handy/Tablet hochkant), links Seitenleiste (ab Laptop)
import React, { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BoltIcon, BanknotesIcon, ClockIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import {
  BoltIcon as BoltSolid,
  BanknotesIcon as BanknotesSolid,
  ClockIcon as ClockSolid,
  Cog6ToothIcon as CogSolid
} from '@heroicons/react/24/solid';
import { useStatus } from '../hooks/data.js';

export const NAV = [
  { to: '/', label: 'Live', icon: BoltIcon, activeIcon: BoltSolid, end: true },
  { to: '/abrechnung', label: 'Abrechnung', icon: BanknotesIcon, activeIcon: BanknotesSolid },
  { to: '/verlauf', label: 'Verlauf', icon: ClockIcon, activeIcon: ClockSolid },
  { to: '/einstellungen', label: 'Einstellungen', icon: Cog6ToothIcon, activeIcon: CogSolid }
];

function Logo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-[0.75rem] bg-primary text-primary-on">
      <BoltSolid className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

export default function AppShell() {
  const { wallbox, demo } = useStatus();
  const { pathname } = useLocation();

  // Beim Seitenwechsel nach oben
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Seitenleiste ab Laptop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-3">
          <Logo />
          <div className="min-w-0">
            <div className="text-headline text-ink">Wall-E</div>
            <div className="truncate text-caption text-muted">{demo ? 'Demo' : wallbox.name || 'go-e Wallbox'}</div>
          </div>
        </div>
        <nav className="space-y-1" aria-label="Hauptnavigation">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-control px-3 text-body font-medium transition-colors ${
                  isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              {({ isActive }) => {
                const Icon = isActive ? item.activeIcon : item.icon;
                return (
                  <>
                    <Icon className="h-[1.375rem] w-[1.375rem]" aria-hidden="true" />
                    {item.label}
                  </>
                );
              }}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] lg:pb-0">
        <Outlet />
      </main>

      {/* Tab-Leiste auf Handy und Tablet */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 text-micro font-semibold transition-colors ${
                  isActive ? 'text-primary' : 'text-subtle hover:text-muted'
                }`
              }
            >
              {({ isActive }) => {
                const Icon = isActive ? item.activeIcon : item.icon;
                return (
                  <>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                    {item.label}
                  </>
                );
              }}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
