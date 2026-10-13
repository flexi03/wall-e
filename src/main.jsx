import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './lib/install.js';
import App from './App.jsx';
import { getWelcomeSeen, hasV1Data, createLocalBackup } from './lib/storage.js';
import { WELCOME_VERSION } from './components/Welcome.jsx';

// Erster Start von V2 mit Daten aus V1: zuerst eine vollständige Kopie auf dem Gerät anlegen
if (getWelcomeSeen() !== WELCOME_VERSION && hasV1Data()) createLocalBackup();

// Früher registrierte Service Worker (Wall-E 1 aus Create React App) entfernen,
// damit alte Installationen keine veralteten Dateien aus dem Cache laden
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
