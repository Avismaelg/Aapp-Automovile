import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { FuelLog } from '@/src/data/mock';
import {
  logEnergy,
  logPriceUnit,
  logUnit,
} from '@/src/lib/fuel';
import { formatMoney, formatNumber } from '@/src/lib/format';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export async function exportFuelReport({
  vehicle,
  logs,
  currency = 'DOP',
}: {
  vehicle: string;
  logs: FuelLog[];
  currency?: string;
}) {
  const electric = logs[0]?.kind === 'electric';
  const energyUnit = electric ? 'kWh' : 'L';
  const totalEnergy = logs.reduce((sum, log) => sum + logEnergy(log), 0);
  const totalCost = logs.reduce((sum, log) => sum + log.total, 0);
  const latest = logs[0];
  const previous = logs[1];
  const distance =
    latest && previous && latest.odometer > previous.odometer
      ? latest.odometer - previous.odometer
      : 0;
  const latestEnergy = latest ? logEnergy(latest) : 0;
  const efficiency = electric
    ? distance > 0
      ? (latestEnergy / distance) * 100
      : 0
    : distance > 0 && latestEnergy > 0
      ? distance / latestEnergy
      : 0;

  const rows = logs
    .map(
      (log) => `
      <tr>
        <td>${escapeHtml(log.date)}</td>
        <td>${escapeHtml(log.station)}</td>
        <td>${formatNumber(logEnergy(log), 2)} ${logUnit(log)}</td>
        <td>${formatMoney(log.pricePerLiter, currency)}${logPriceUnit(log)}</td>
        <td>${formatMoney(log.total, currency)}</td>
        <td>${formatNumber(log.odometer, 0)} km</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #10151B; margin: 32px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; letter-spacing: 2px; font-size: 12px; color: #FF5A1F; }
  h1 { font-size: 26px; margin: 18px 0 4px; }
  .muted { color: #6A7688; font-size: 12px; }
  .grid { display: flex; gap: 12px; margin: 24px 0; }
  .card { flex: 1; border: 1px solid #E3E8EF; border-radius: 14px; padding: 14px; }
  .value { font-size: 22px; font-weight: 800; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
  th { text-align: left; background: #F4F6F9; padding: 10px; color: #4A5566; }
  td { padding: 10px; border-bottom: 1px solid #EDF0F4; }
  .footer { margin-top: 28px; font-size: 10px; color: #8A94A6; }
</style>
</head>
<body>
  <div class="brand">● CARAVANA</div>
  <h1>${electric ? 'Reporte de energía' : 'Reporte de combustible'}</h1>
  <div class="muted">${escapeHtml(vehicle)} · Generado el ${new Date().toLocaleDateString('es-DO')}</div>

  <div class="grid">
    <div class="card">
      <div class="muted">${electric ? 'Consumo' : 'Rendimiento'}</div>
      <div class="value">${formatNumber(efficiency, 1)} ${electric ? 'kWh/100 km' : 'km/L'}</div>
    </div>
    <div class="card">
      <div class="muted">${electric ? 'Energía' : 'Combustible'}</div>
      <div class="value">${formatNumber(totalEnergy, 1)} ${energyUnit}</div>
    </div>
    <div class="card"><div class="muted">Gasto</div><div class="value">${formatMoney(totalCost, currency)}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Fecha</th><th>${electric ? 'Cargador' : 'Estación'}</th>
        <th>${electric ? 'kWh' : 'Litros'}</th><th>Precio</th><th>Total</th><th>Odómetro</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    Caravana · Reporte generado automáticamente.
    ${electric ? 'Los cálculos usan el consumo real de energía.' : 'Los cálculos usan el método de tanque lleno.'}
  </div>
</body>
</html>`;

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return null;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Compartir reporte de Caravana',
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}
