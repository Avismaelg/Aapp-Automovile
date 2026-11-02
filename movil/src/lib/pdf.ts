import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { FuelLog, MaintenanceRecord, Vehicle } from '@/src/types/models';
import {
  logEnergy,
  logPriceUnit,
  logUnit,
} from '@/src/lib/fuel';
import { formatMoney, formatNumber } from '@/src/lib/format';
import {
  formatHistoryDate,
  formatMonthYear,
  maintenanceTotal,
  ownershipLabel,
} from '@/src/lib/vehicle-history';
import { getCurrency, getLanguage, getLocale, t } from '@/src/i18n';

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
  currency = getCurrency(),
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
<html lang="${getLanguage()}">
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
  <h1>${electric ? t('Reporte de energía') : t('Reporte de combustible')}</h1>
  <div class="muted">${escapeHtml(vehicle)} · ${t('Generado el {0}', new Date().toLocaleDateString(getLocale()))}</div>

  <div class="grid">
    <div class="card">
      <div class="muted">${electric ? t('Consumo') : t('Rendimiento')}</div>
      <div class="value">${formatNumber(efficiency, 1)} ${electric ? t('kWh/100 km') : 'km/L'}</div>
    </div>
    <div class="card">
      <div class="muted">${electric ? t('Energía') : t('Combustible')}</div>
      <div class="value">${formatNumber(totalEnergy, 1)} ${energyUnit}</div>
    </div>
    <div class="card"><div class="muted">${t('Gasto')}</div><div class="value">${formatMoney(totalCost, currency)}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${t('Fecha')}</th><th>${electric ? t('Cargador') : t('Estación')}</th>
        <th>${electric ? 'kWh' : t('Litros')}</th><th>${t('Precio')}</th><th>${t('Total')}</th><th>${t('Odómetro')}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    ${t('Caravana · Reporte generado automáticamente.')}
    ${electric ? t('Los cálculos usan el consumo real de energía.') : t('Los cálculos usan el método de tanque lleno.')}
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
      dialogTitle: t('Compartir reporte de Caravana'),
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}

export async function exportVehicleSaleReport({
  vehicle,
  ownerName,
  ownerUsername,
  maintenance,
  fuelLogs,
  currency = getCurrency(),
}: {
  vehicle: Vehicle;
  ownerName: string;
  ownerUsername: string;
  maintenance: MaintenanceRecord[];
  fuelLogs: FuelLog[];
  currency?: string;
}) {
  const electric = vehicle.fuel === 'electric';
  const kindLabels = {
    car: t('Coche'),
    motorcycle: t('Motocicleta'),
    ev: 'EV',
    truck: t('Camión / pickup'),
  } as const;
  const fuelLabels = {
    gasoline: t('Gasolina'),
    diesel: t('Diésel'),
    electric: t('Eléctrico'),
  } as const;
  const totalMaintenance = maintenanceTotal(maintenance);
  const totalEnergy = fuelLogs.reduce((sum, log) => sum + logEnergy(log), 0);
  const totalFuelCost = fuelLogs.reduce((sum, log) => sum + log.total, 0);
  const odometers = fuelLogs.map((log) => log.odometer).filter((value) => value > 0);
  const kmTracked =
    odometers.length > 1 ? Math.max(...odometers) - Math.min(...odometers) : 0;

  const maintenanceRows = maintenance
    .map(
      (record) => `
      <tr>
        <td>${escapeHtml(formatHistoryDate(record.date))}</td>
        <td>${escapeHtml(record.title)}</td>
        <td>${formatNumber(record.odometerKm, 0)} km</td>
        <td>${escapeHtml(record.shop)}</td>
        <td>${formatMoney(record.cost, currency)}</td>
      </tr>`,
    )
    .join('');

  const fuelRows = fuelLogs
    .map(
      (log) => `
      <tr>
        <td>${escapeHtml(log.date)}</td>
        <td>${escapeHtml(log.station)}</td>
        <td>${formatNumber(logEnergy(log), 2)} ${logUnit(log)}</td>
        <td>${formatMoney(log.total, currency)}</td>
        <td>${formatNumber(log.odometer, 0)} km</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="${getLanguage()}">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #10151B; margin: 32px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; letter-spacing: 2px; font-size: 12px; color: #FF5A1F; }
  h1 { font-size: 27px; margin: 18px 0 4px; }
  h2 { font-size: 14px; margin: 26px 0 8px; color: #334155; text-transform: uppercase; letter-spacing: 1px; }
  .muted { color: #6A7688; font-size: 12px; }
  .grid { display: flex; gap: 12px; margin: 24px 0; }
  .card { flex: 1; border: 1px solid #E3E8EF; border-radius: 14px; padding: 14px; }
  .value { font-size: 20px; font-weight: 800; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
  th { text-align: left; background: #F4F6F9; padding: 9px; color: #4A5566; }
  td { padding: 9px; border-bottom: 1px solid #EDF0F4; vertical-align: top; }
  .data td:first-child { color: #6A7688; width: 32%; }
  .footer { margin-top: 28px; font-size: 10px; color: #8A94A6; line-height: 1.5; }
</style>
</head>
<body>
  <div class="brand">● CARAVANA · ${t('FICHA DE VENTA')}</div>
  <h1>${escapeHtml(vehicle.make)} ${escapeHtml(vehicle.model)} ${vehicle.year}</h1>
  <div class="muted">${escapeHtml(vehicle.nickname)} · @${escapeHtml(ownerUsername)} · ${t('Generado el {0}', new Date().toLocaleDateString(getLocale()))}</div>

  <div class="grid">
    <div class="card"><div class="muted">${t('Odómetro')}</div><div class="value">${formatNumber(vehicle.odometerKm, 0)} km</div></div>
    <div class="card"><div class="muted">${t('Mantenimientos')}</div><div class="value">${maintenance.length}</div></div>
    <div class="card"><div class="muted">${electric ? t('Cargas') : t('Repostajes')}</div><div class="value">${fuelLogs.length}</div></div>
    <div class="card"><div class="muted">${t('Invertido en servicio')}</div><div class="value">${formatMoney(totalMaintenance, currency)}</div></div>
  </div>

  <h2>${t('Propietario y uso')}</h2>
  <table class="data">
    <tr><td>${t('Propietario')}</td><td>${escapeHtml(ownerName)} (@${escapeHtml(ownerUsername)})</td></tr>
    <tr><td>${t('En Caravana desde')}</td><td>${formatMonthYear(vehicle.acquiredAt)}</td></tr>
    <tr><td>${t('Periodo de uso')}</td><td>${escapeHtml(ownershipLabel(vehicle.acquiredAt))}</td></tr>
    <tr><td>${t('Kilómetros medidos')}</td><td>${formatNumber(kmTracked, 0)} ${t('km registrados entre repostajes')}</td></tr>
  </table>

  <h2>${t('Datos técnicos')}</h2>
  <table class="data">
    <tr><td>${t('Marca / modelo')}</td><td>${escapeHtml(vehicle.make)} ${escapeHtml(vehicle.model)}</td></tr>
    <tr><td>${t('Año')}</td><td>${vehicle.year}</td></tr>
    <tr><td>${t('Carrocería')}</td><td>${kindLabels[vehicle.kind]}</td></tr>
    <tr><td>${t('Energía')}</td><td>${fuelLabels[vehicle.fuel]}</td></tr>
    <tr><td>${t('Rendimiento')}</td><td>${formatNumber(vehicle.efficiency, 1)} ${vehicle.efficiencyUnit === 'kwh_100km' ? t('kWh/100 km') : 'km/L'}</td></tr>
    <tr><td>${t('Odómetro actual')}</td><td>${formatNumber(vehicle.odometerKm, 0)} km</td></tr>
  </table>

  <h2>${t('Historial de mantenimiento')}</h2>
  <table>
    <thead><tr><th>${t('Fecha')}</th><th>${t('Servicio')}</th><th>${t('Odómetro')}</th><th>${t('Taller')}</th><th>${t('Coste')}</th></tr></thead>
    <tbody>${maintenanceRows || `<tr><td colspan="5">${t('Sin mantenimientos registrados.')}</td></tr>`}</tbody>
  </table>

  <h2>${electric ? t('Cargas de energía') : t('Repostajes')}</h2>
  <table>
    <thead><tr><th>${t('Fecha')}</th><th>${electric ? t('Cargador') : t('Estación')}</th><th>${t('Energía')}</th><th>${t('Coste')}</th><th>${t('Odómetro')}</th></tr></thead>
    <tbody>${fuelRows || `<tr><td colspan="5">${t('Sin registros.')}</td></tr>`}</tbody>
  </table>

  <div class="footer">
    ${t('Ficha informativa generada por el propietario en Caravana. No incluye placa, ubicación exacta, teléfono ni datos de pago. Los datos proceden de los registros del propietario y no sustituyen una inspección mecánica independiente.')}<br />
    ${t('Energía total registrada: {0} · Gasto total registrado: {1}.', `${formatNumber(totalEnergy, 1)} ${electric ? 'kWh' : 'L'}`, formatMoney(totalFuelCost, currency))}
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
      dialogTitle: t('Compartir ficha de venta de Caravana'),
      UTI: 'com.adobe.pdf',
    });
  }
  return uri;
}
