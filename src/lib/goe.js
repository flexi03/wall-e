// Verbindung zur go-e Cloud API über den eigenen PHP-Proxy (server/api/*.php).
// Seriennummer und Token gehen im POST-Body, nie in der URL (sonst landen sie in Server-Logs).

const ERROR_MESSAGES = {
  400: 'Ungültige Anfrage – prüfe Seriennummer und Token',
  403: 'Wallbox offline oder Cloud-API nicht aktiviert',
  404: 'Wallbox nicht gefunden – prüfe die Seriennummer',
  422: 'Ungültige Parameter – prüfe den API-Token',
  429: 'Zu viele Anfragen – warte einen Moment',
  502: 'go-e Cloud nicht erreichbar'
};

// Abbruch nach 20 s, damit eine hängende Anfrage die Aktualisierung nicht blockiert
async function post(endpoint, payload, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

// go-e "car": 1 bereit, 2 lädt, 3 wartet auf Fahrzeug, 4 Laden beendet, 5 Fehler
export const CAR_STATES = {
  0: { label: 'Unbekannt', tone: 'neutral' },
  1: { label: 'Kein Auto', tone: 'neutral' },
  2: { label: 'Lädt', tone: 'success' },
  3: { label: 'Wartet auf Auto', tone: 'primary' },
  4: { label: 'Laden beendet', tone: 'primary' },
  5: { label: 'Fehler', tone: 'danger' }
};

const PHASE_MODES = { 0: 'Automatisch', 1: '1-phasig', 2: '3-phasig' };

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

// Rohdaten der go-e API in ein übersichtliches Objekt übersetzen
export function parseStatus(raw) {
  const nrg = Array.isArray(raw.nrg) ? raw.nrg : null;
  const car = raw.car || 1;
  const temperature = Array.isArray(raw.tma) && raw.tma.length > 0 ? num(raw.tma[0]) : num(raw.tmp);
  const cards = Array.isArray(raw.cards) ? raw.cards : [];
  const lastCard = typeof raw.lrc === 'number' ? raw.lrc : null;

  return {
    car,
    state: CAR_STATES[car] || CAR_STATES[0],
    isCharging: car === 2,
    powerW: nrg ? num(nrg[11]) || 0 : 0,
    sessionWh: num(raw.wh) || 0,
    totalWh: num(raw.eto) || 0,
    amp: num(raw.amp),
    maxAmp: num(raw.ama),
    phaseMode: PHASE_MODES[raw.psm || 0] || 'Unbekannt',
    temperature,
    phases: nrg
      ? ['L1', 'L2', 'L3'].map((name, i) => ({
          name,
          voltage: num(nrg[i]),
          current: num(nrg[4 + i]),
          powerW: num(nrg[7 + i])
        }))
      : [],
    cards,
    activeCardIndex: lastCard,
    activeCardName:
      lastCard !== null && cards[lastCard] ? cards[lastCard].name || `Karte ${lastCard + 1}` : null,
    // Export-Link für den Ladeverlauf (go-e "dll")
    historyLink: typeof raw.dll === 'string' && raw.dll.startsWith('https://data.v3.go-e.io/') ? raw.dll : null,
    fetchedAt: new Date().toISOString()
  };
}

export async function fetchStatus({ serial, token }) {
  let response;
  try {
    response = await post('/api/status.php', { serial, token });
  } catch (error) {
    const wrapped = new Error(error.name === 'AbortError' ? 'Zeitüberschreitung – go-e antwortet nicht' : 'Keine Internetverbindung');
    wrapped.transient = true;
    throw wrapped;
  }
  if (!response.ok) {
    let message = ERROR_MESSAGES[response.status] || `Fehler ${response.status}`;
    // 5xx und 429 sind meist nur kurz – die App versucht es dann still erneut
    const transient = response.status >= 500 || response.status === 429;
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {
      // keine JSON-Antwort
    }
    const error = new Error(message);
    error.transient = transient;
    throw error;
  }
  return parseStatus(await response.json());
}

export async function testConnection({ serial, token }) {
  try {
    const response = await post('/api/test.php', { serial: serial.trim(), token: token.trim() });
    const result = await response.json();
    if (!response.ok || !result.success) {
      return { success: false, error: result.error || `Fehler ${response.status}` };
    }
    return { success: true, status: parseStatus(result.data) };
  } catch (error) {
    return { success: false, error: 'Verbindung fehlgeschlagen' };
  }
}

// Beispieldaten im Format der go-e API (Demo-Modus)
export function demoStatus() {
  const jitter = (value, spread) => value + (Math.random() - 0.5) * spread;
  const current = [jitter(10.4, 0.4), jitter(10.5, 0.4), jitter(10.3, 0.4)];
  const voltage = [jitter(231, 3), jitter(230, 3), jitter(232, 3)];
  const power = current.map((c, i) => c * voltage[i]);
  return parseStatus({
    car: 2,
    nrg: [...voltage, 0, ...current, ...power, 0, power.reduce((a, b) => a + b, 0), 99, 99, 99, 0],
    wh: 12400 + Math.round(Math.random() * 300),
    eto: 18432,
    amp: 11,
    ama: 16,
    psm: 0,
    tma: [27.5],
    lrc: 1, // Sam lädt dreiphasig
    dll: 'https://data.v3.go-e.io/export?e=demo',
    cards: [
      { name: 'Alex', energy: 1843200 },
      { name: 'Sam', energy: 412500 }
    ]
  });
}
