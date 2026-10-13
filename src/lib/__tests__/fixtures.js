// Testdaten im exakten Format von V1 (so wie sie in localStorage auf dem Handy liegen)

export const cards = [
  { name: 'Alex', energy: 812345 },
  { name: 'Sam Fob', energy: 1534567 },
  { name: 'n/a', energy: 0 },
  { name: 'n/a', energy: 0 }
];

// V1-Stand nach einer abgeschlossenen Abrechnung und gesetztem Startwert
export const v1Storage = {
  goe_serial_number: '123456',
  goe_api_token: 'abcDEF123token',
  kwh_price: '0.35',
  kwh_price_history: JSON.stringify([
    { id: '1700000000000-ab12', label: 'Stadtwerke 2025', price: 0.35, createdAt: '2025-01-03T10:00:00.000Z' },
    { id: 'default', label: 'Aktueller Tarif', price: 0.39, createdAt: '2024-06-01T10:00:00.000Z' }
  ]),
  energy_meter_reading: '5321.4',
  energy_meter_timestamp: '2026-10-01T08:00:00.000Z',
  before_meter_reading: '4800',
  before_meter_timestamp: '2026-06-01T08:00:00.000Z',
  billing_baseline: JSON.stringify({ totalEnergyKwh: 1900.5, meterReading: 4800 }),
  billing_periods: JSON.stringify([
    {
      id: '1717228800000-x1y2z',
      label: 'Mai 2026',
      createdAt: '2026-06-01T08:00:00.000Z',
      chargedKwh: 412.3,
      pricePerKwh: 0.35,
      totalCost: 144.305,
      note: '',
      meterReading: 4800,
      meterConsumption: 412.3,
      userBreakdown: [
        { name: 'Alex', share: 0.35, energyKwh: 144.305, cost: 50.50675 },
        { name: 'Sam Fob', share: 0.65, energyKwh: 267.995, cost: 93.79825 }
      ],
      baselineBefore: { totalEnergyKwh: 1500, meterReading: 4387.7 },
      baselineAfter: { totalEnergyKwh: 1900.5, meterReading: 4800 }
    }
  ]),
  saved_stats: JSON.stringify([
    { id: '2026-06-01-api', type: 'api', label: 'Backup Juni', createdAt: '2026-06-01T08:00:00.000Z', totalKwh: 400, totalCost: 140, pricePerKwh: 0.35, note: 'API / Wallbox Daten', userBreakdown: [] }
  ]),
  darkMode: 'true',
  wallbox_sessions: '[]',
  goe_auth_cookies: 'session=abc'
};

export function seed(storage = v1Storage) {
  localStorage.clear();
  Object.entries(storage).forEach(([key, value]) => localStorage.setItem(key, value));
}

// Rechenweg aus V1 (EnergyUsagePage.js), wörtlich übernommen – dient als Referenz
export function v1Compute({ cards: apiCards, baseline, meterReading, beforeMeterReading, kwhPrice }) {
  const users = [];
  apiCards.forEach((card, index) => {
    if (card.name !== 'n/a' && card.energy > 0) {
      users.push({ name: card.name, energy: card.energy, energyKwh: (card.energy / 1000).toFixed(2), cardIndex: index });
    }
  });
  const rawUsers = users.map((user) => ({ ...user, rawEnergyKwh: parseFloat(user.energyKwh) }));
  const totalRawEnergy = rawUsers.reduce((sum, u) => sum + (u.rawEnergyKwh || 0), 0);
  const hasBaselineEnergy = baseline && typeof baseline.totalEnergyKwh === 'number' && baseline.meterReading !== null;
  const baselineTotalEnergy = hasBaselineEnergy ? baseline.totalEnergyKwh : 0;
  const deltaEnergy = hasBaselineEnergy ? Math.max(0, totalRawEnergy - baselineTotalEnergy) : totalRawEnergy;
  const userStats = rawUsers.map((user) => {
    const share = totalRawEnergy > 0 ? (user.rawEnergyKwh || 0) / totalRawEnergy : 0;
    const adjustedEnergy = deltaEnergy * share;
    return { ...user, energyKwh: adjustedEnergy.toFixed(2) };
  });

  const totalEnergyKwh = userStats.reduce((sum, user) => sum + parseFloat(user.energyKwh), 0);
  const meterReadingNum = parseFloat(meterReading);
  const beforeMeterReadingNum = parseFloat(beforeMeterReading || '0');
  const kwhPriceNum = parseFloat(kwhPrice || '0.39');
  const userStatsWithCosts = userStats.map((user) => ({ ...user, costWithoutLoss: parseFloat(user.energyKwh) * kwhPriceNum }));
  const totalMeterConsumption = !isNaN(meterReadingNum) && !isNaN(beforeMeterReadingNum) ? meterReadingNum - beforeMeterReadingNum : null;
  let totalMeterCost = totalMeterConsumption ? totalMeterConsumption * kwhPriceNum : null;
  const totalWallboxCost = userStatsWithCosts.reduce((sum, user) => sum + user.costWithoutLoss, 0);
  let chargingLossMultiplier = totalMeterConsumption && totalEnergyKwh > 0 ? totalMeterConsumption / totalEnergyKwh : 1;
  const isNegativeLoss = chargingLossMultiplier <= 1;
  if (isNegativeLoss && totalWallboxCost) totalMeterCost = totalWallboxCost * 1.018;
  if (isNegativeLoss) chargingLossMultiplier = 1.018;
  return {
    users: userStatsWithCosts.map((u) => ({ name: u.name, kwh: parseFloat(u.energyKwh), cost: u.costWithoutLoss * chargingLossMultiplier })),
    totalEnergyKwh,
    totalMeterConsumption,
    totalMeterCost,
    isNegativeLoss
  };
}
