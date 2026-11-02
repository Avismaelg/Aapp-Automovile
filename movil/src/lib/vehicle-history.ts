import { Ionicons } from '@expo/vector-icons';

import type { FuelLog, MaintenanceRecord, Vehicle } from '@/src/types/models';
import { logEnergy } from '@/src/lib/fuel';
import { formatKmValue, getLocale, t } from '@/src/i18n';

export type MaintenanceStatus = 'ok' | 'soon' | 'due';

export function formatHistoryDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(getLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMonthYear(iso?: string) {
  if (!iso) return t('No registrado');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t('No registrado');
  return date.toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' });
}

export function ownershipLabel(acquiredAt?: string) {
  if (!acquiredAt) return t('Periodo no registrado');
  const start = new Date(acquiredAt);
  if (Number.isNaN(start.getTime())) return t('Periodo no registrado');

  const now = new Date();
  const months = Math.max(
    1,
    (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth(),
  );

  if (months < 12) return t('{0} {1} de uso', months, months === 1 ? 'mes' : 'meses');
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return t('{0} {1}{2} de uso', years, years === 1 ? 'año' : 'años', rest ? ` y ${rest} meses` : '');
}

export function maintenanceSummary(
  vehicle: Vehicle,
  records: MaintenanceRecord[],
) {
  const sorted = [...records].sort((a, b) => b.odometerKm - a.odometerKm);
  const last = sorted[0];
  const nextKm =
    last?.nextKm ??
    vehicle.odometerKm + (vehicle.kind === 'ev' ? 10000 : 5000);
  const remainingKm = Math.max(0, nextKm - vehicle.odometerKm);

  let status: MaintenanceStatus = 'ok';
  if (remainingKm <= 300) status = 'due';
  else if (remainingKm <= 1500) status = 'soon';

  const label =
    status === 'due'
      ? t('Mantenimiento pendiente')
      : status === 'soon'
        ? t('Servicio próximo')
        : t('Mantenimiento al día');

  const detail =
    status === 'due'
      ? t('Toca revisar en {0}', formatKmValue(remainingKm))
      : status === 'soon'
        ? t('Próximo servicio en {0}', formatKmValue(remainingKm))
        : t('Próximo servicio en {0}', formatKmValue(remainingKm));

  return {
    records: sorted,
    last,
    nextKm,
    remainingKm,
    status,
    label,
    detail,
  };
}

export function vehicleUsage(vehicle: Vehicle, logs: FuelLog[]) {
  const vehicleLogs = logs.filter((log) => log.vehicleId === vehicle.id);
  const odometers = vehicleLogs.map((log) => log.odometer).filter((value) => value > 0);
  const kmTracked =
    odometers.length > 1 ? Math.max(...odometers) - Math.min(...odometers) : 0;
  const totalEnergy = vehicleLogs.reduce((sum, log) => sum + logEnergy(log), 0);
  const totalSpent = vehicleLogs.reduce((sum, log) => sum + log.total, 0);

  return {
    logs: vehicleLogs,
    fillups: vehicleLogs.length,
    kmTracked,
    totalEnergy,
    totalSpent,
    electric: vehicle.fuel === 'electric',
  };
}

export function maintenanceTotal(records: MaintenanceRecord[]) {
  return records.reduce((sum, record) => sum + record.cost, 0);
}

export function maintenanceIcon(kind: MaintenanceRecord['kind']): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'oil':
      return 'water-outline';
    case 'tires':
      return 'ellipse-outline';
    case 'brakes':
      return 'disc-outline';
    case 'battery':
      return 'battery-charging-outline';
    case 'filters':
      return 'filter-outline';
    case 'inspection':
      return 'shield-checkmark-outline';
    default:
      return 'construct-outline';
  }
}
