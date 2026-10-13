import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import { ToastProvider } from './components/ui.jsx';
import { StatusProvider, PersonFilterProvider, useThemeEffect } from './hooks/data.js';
import Welcome from './components/Welcome.jsx';
import PeoplePage from './pages/PeoplePage.jsx';
import HistorySettingsPage from './pages/HistorySettingsPage.jsx';
import LivePage from './pages/LivePage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import WallboxPage from './pages/WallboxPage.jsx';
import PricesPage from './pages/PricesPage.jsx';
import SharePage from './pages/SharePage.jsx';
import ImportPage from './pages/ImportPage.jsx';
import InfoPage from './pages/InfoPage.jsx';
import KioskPage from './pages/KioskPage.jsx';

// Adressen aus V1 leiten weiter, damit Lesezeichen und alte Links funktionieren
const LEGACY_REDIRECTS = {
  '/dashboard': '/',
  '/energy': '/abrechnung',
  '/sessions': '/verlauf',
  '/goe-auth': '/verlauf',
  '/settings': '/einstellungen',
  '/wallbox-config': '/einstellungen/wallbox'
};

export default function App() {
  useThemeEffect();
  return (
    <BrowserRouter>
      <StatusProvider>
        <PersonFilterProvider>
          <ToastProvider>
            <Welcome />
            <Routes>
              <Route path="/kiosk" element={<KioskPage />} />
              <Route element={<AppShell />}>
                <Route index element={<LivePage />} />
                <Route path="abrechnung" element={<BillingPage />} />
                <Route path="verlauf" element={<HistoryPage />} />
                <Route path="einstellungen" element={<SettingsPage />} />
                <Route path="einstellungen/wallbox" element={<WallboxPage />} />
                <Route path="einstellungen/strompreis" element={<PricesPage />} />
                <Route path="einstellungen/teilen" element={<SharePage />} />
                <Route path="einstellungen/personen" element={<PeoplePage />} />
                <Route path="einstellungen/ladeverlauf" element={<HistorySettingsPage />} />
                <Route path="import" element={<ImportPage />} />
                <Route path="info" element={<InfoPage />} />
                {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
                  <Route key={from} path={from} element={<Navigate to={to} replace />} />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </ToastProvider>
        </PersonFilterProvider>
      </StatusProvider>
    </BrowserRouter>
  );
}
