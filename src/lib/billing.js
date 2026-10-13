// Abrechnungslogik als reine Funktionen (ohne React, ohne localStorage) – dadurch testbar.
// Die Rechenwege entsprechen V1 (EnergyUsagePage); Abweichungen sind markiert und in docs/DATA.md erklärt.

export const STANDARD_LOSS = 0.018; // V1: 1,8 % Ladeverlust, wenn der Zähler keinen plausiblen Wert liefert

const round2 = (n) => Math.round(n * 100) / 100;

// RFID-Karten mit Namen und Energie (Wh) → Personen mit kWh-Zählerstand der Wallbox
export function cardsToUsers(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card && card.name && card.name !== 'n/a' && card.energy > 0)
    .map(({ card, index }) => ({
      name: card.name,
      cardIndex: index,
      // V1 rundet auf 2 Nachkommastellen (toFixed(2)) – beibehalten, damit Summen identisch bleiben
      totalKwh: round2(card.energy / 1000)
    }));
}

export function wallboxTotals(cards) {
  const users = cardsToUsers(cards);
  return {
    totalKwh: users.reduce((sum, u) => sum + u.totalKwh, 0),
    cards: Object.fromEntries(users.map((u) => [u.name, u.totalKwh]))
  };
}

/**
 * Laufende Abrechnung berechnen.
 * @param {object} input
 * @param {Array} input.cards       RFID-Karten aus der go-e API ({ name, energy (Wh) })
 * @param {object} input.baseline   { totalEnergyKwh, meterReading, cards? } – Stand beim letzten Abschluss
 * @param {object} input.meters     { start, current } – Hauszähler in kWh
 * @param {number} input.price      €/kWh
 */
export function computeCurrentPeriod({ cards, baseline, meters, price }) {
  const users = cardsToUsers(cards);
  const totalRaw = users.reduce((sum, u) => sum + u.totalKwh, 0);
  const hasBaseline =
    baseline && typeof baseline.totalEnergyKwh === 'number' && baseline.meterReading !== null && baseline.meterReading !== undefined;
  const baselineCards = hasBaseline && baseline.cards && typeof baseline.cards === 'object' ? baseline.cards : null;

  let periodUsers;
  if (baselineCards) {
    // Neu in V2: Seit dem ersten Abschluss in V2 gibt es Startwerte pro Karte → echter Verbrauch pro Person
    periodUsers = users.map((u) => ({
      ...u,
      kwh: round2(Math.max(0, u.totalKwh - (baselineCards[u.name] ?? 0)))
    }));
  } else {
    // V1: Zuwachs seit der Basislinie, verteilt nach dem Gesamtanteil jeder Karte
    const delta = hasBaseline ? Math.max(0, totalRaw - baseline.totalEnergyKwh) : totalRaw;
    periodUsers = users.map((u) => {
      const share = totalRaw > 0 ? u.totalKwh / totalRaw : 0;
      return { ...u, kwh: round2(delta * share) };
    });
  }

  const wallboxKwh = periodUsers.reduce((sum, u) => sum + u.kwh, 0);
  const meterKwh =
    typeof meters.start === 'number' && typeof meters.current === 'number' ? meters.current - meters.start : null;

  // Ladeverlust: Hauszähler / Wallbox. Unplausibel (≤ 0 %) → Standard 1,8 % (wie V1)
  let factor = meterKwh && wallboxKwh > 0 ? meterKwh / wallboxKwh : 1;
  const isStandardLoss = factor <= 1;
  if (isStandardLoss) factor = 1 + STANDARD_LOSS;

  const people = periodUsers.map((u) => {
    const baseCost = u.kwh * price;
    return {
      name: u.name,
      cardIndex: u.cardIndex,
      kwh: u.kwh,
      share: wallboxKwh > 0 ? u.kwh / wallboxKwh : 0,
      baseCost,
      cost: baseCost * factor
    };
  });

  const baseCost = wallboxKwh * price;
  const totalCost = isStandardLoss ? baseCost * factor : meterKwh * price;

  return {
    people,
    wallboxKwh,
    meterKwh,
    lossPercent: (factor - 1) * 100,
    isStandardLoss,
    factor,
    baseCost,
    totalCost,
    price,
    perCard: !!baselineCards,
    source: 'cards',
    totals: { totalKwh: totalRaw, cards: Object.fromEntries(users.map((u) => [u.name, u.totalKwh])) }
  };
}

export const UNASSIGNED_LABEL = 'Nicht zugeordnet';

// Verteilung einer Abrechnung: Anteile aus dem Verbrauch der laufenden Abrechnung
export function splitBreakdown(current, chargedKwh, price) {
  const rows = current.people.filter((p) => p.kwh > 0).map((p) => ({ name: p.name, personKey: p.key, kwh: p.kwh }));
  if (current.unassigned && current.unassigned.kwh > 0) rows.push({ name: UNASSIGNED_LABEL, personKey: 'none', kwh: current.unassigned.kwh });
  let total = rows.reduce((sum, r) => sum + r.kwh, 0);
  let list = rows;
  if (total === 0) {
    // Kein Verbrauch seit Start: wie V1 nach Gesamtstand der Karten, sonst gleichmäßig
    const cards = current.totals ? Object.entries(current.totals.cards) : [];
    list = cards.length
      ? cards.map(([name, kwh]) => ({ name, kwh }))
      : current.people.map((p) => ({ name: p.name, personKey: p.key, kwh: 1 }));
    total = list.reduce((sum, r) => sum + r.kwh, 0);
  }
  return list.map((r) => {
    const share = total > 0 ? r.kwh / total : 0;
    const energyKwh = chargedKwh * share;
    return { name: r.name, ...(r.personKey ? { personKey: r.personKey } : {}), share, energyKwh, cost: energyKwh * price };
  });
}

/**
 * Abrechnung abschließen (V1: "Abrechnung erstellen").
 * Liefert den neuen Eintrag und die neue Basislinie für die nächste Abrechnung.
 * cardTotals = aktuelle Kartenstände (für die Rückfallrechnung ohne Ladeverlauf).
 */
export function closePeriod({ current, cardTotals, baseline, meterReading, chargedKwh, price, label, note, existingCount, now = new Date() }) {
  const baselineMeter = typeof baseline.meterReading === 'number' ? baseline.meterReading : 0;
  // Ohne Live-Status (Wallbox gerade offline) bleiben die Kartenstände der alten Basislinie stehen
  const totals = cardTotals || current.totals || { totalKwh: baseline.totalEnergyKwh ?? 0, cards: baseline.cards };
  const id = `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;
  const entry = {
    id,
    label: label && label.trim() ? label.trim() : `Zeitraum ${existingCount + 1}`,
    createdAt: now.toISOString(),
    chargedKwh,
    pricePerKwh: price,
    totalCost: chargedKwh * price,
    note: note || '',
    meterReading,
    meterConsumption: meterReading - baselineMeter,
    userBreakdown: splitBreakdown(current, chargedKwh, price),
    source: current.source || 'cards',
    ...(current.from ? { from: new Date(current.from).toISOString() } : {}),
    to: now.toISOString(),
    baselineBefore: {
      totalEnergyKwh: baseline.totalEnergyKwh ?? 0,
      meterReading: baseline.meterReading ?? null,
      ...(baseline.cards ? { cards: baseline.cards } : {}),
      ...(baseline.at ? { at: baseline.at } : {})
    },
    baselineAfter: {
      totalEnergyKwh: totals.totalKwh,
      meterReading,
      cards: totals.cards,
      at: now.toISOString()
    }
  };
  return { entry, baseline: entry.baselineAfter };
}

// Vorschlag für die kWh einer neuen Abrechnung: Hauszähler seit Start (V1: Differenz zur Basislinie)
export function suggestChargedKwh({ meterReading, baseline, current }) {
  if (typeof meterReading === 'number' && typeof baseline.meterReading === 'number') {
    const delta = meterReading - baseline.meterReading;
    if (delta > 0) return round2(delta);
  }
  if (current.meterKwh && current.meterKwh > 0) return round2(current.meterKwh);
  return round2(current.wallboxKwh);
}

// Abrechnung bearbeiten (V1: kWh und Preis neu, Anteile bleiben fix)
export function editPeriod(period, { label, note, chargedKwh, pricePerKwh, meterReading }) {
  const userBreakdown = (period.userBreakdown || []).map((u) => {
    const share = u.share !== undefined ? u.share : 0;
    const energyKwh = chargedKwh * share;
    return { ...u, share, energyKwh, cost: energyKwh * pricePerKwh };
  });
  return {
    ...period,
    label: label && label.trim() ? label.trim() : period.label,
    note: note || '',
    chargedKwh,
    pricePerKwh,
    totalCost: chargedKwh * pricePerKwh,
    meterReading: typeof meterReading === 'number' && !isNaN(meterReading) ? meterReading : period.meterReading,
    userBreakdown
  };
}

// Abrechnung löschen: Basislinie auf den neuesten verbleibenden Abschluss zurücksetzen (V1)
export function deletePeriod(periods, id) {
  const removed = periods.find((p) => p.id === id);
  const remaining = periods.filter((p) => p.id !== id);
  let baseline;
  if (remaining.length > 0) {
    baseline = remaining[0].baselineAfter || undefined;
  } else if (removed && removed.baselineBefore && removed.baselineBefore.meterReading !== null) {
    // V2: ohne verbleibende Abrechnung zum Stand vor der gelöschten zurück (V1 hat hier alles zurückgesetzt)
    baseline = removed.baselineBefore;
  } else {
    baseline = { totalEnergyKwh: null, meterReading: null };
  }
  return { periods: remaining, baseline };
}

export function periodTotals(periods) {
  return {
    kwh: periods.reduce((sum, p) => sum + (p.chargedKwh || 0), 0),
    cost: periods.reduce((sum, p) => sum + (p.totalCost || 0), 0)
  };
}
