// Anpassungen für deine Installation. Kopiere diese Datei nach site.config.js und trage deine Werte ein.
// site.config.js wird nicht veröffentlicht; fehlt sie, gilt diese Beispiel-Datei.
export default {
  // Lokale Entwicklung: Anfragen an /api/… werden an diesen Server weitergeleitet (dort läuft der PHP-Proxy).
  // Leer lassen, wenn du lokal einen eigenen PHP-Server startest.
  devApiTarget: '',

  // Kontakt und Rechtliches in „Hilfe & Datenschutz“. Leere Werte werden nicht angezeigt.
  contact: {
    email: '',
    website: '',
    imprint: '',
    privacy: ''
  }
};
