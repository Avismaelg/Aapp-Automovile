import { Ionicons } from '@expo/vector-icons';

import type { FuelLog, MaintenanceRecord, Vehicle } from '@/src/types/models';
import { logEnergy } from '@/src/lib/fuel';

export type MaintenanceStatus = 'ok' | 'soon' | 'due';

export function formatHistoryDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('es-DO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMonthYear(iso?: string) {
  if (!iso) return 'No registrado';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No registrado';
  return date.toLocaleDateString('es-DO', { month: 'short', year: 'numeric' });
}

export function ownershipLabel(acquiredAt?: string) {
  if (!acquiredAt) return 'Periodo no registrado';
  const start = new Date(acquiredAt);
  if (Number.isNaN(start.getTime())) return 'Periodo no registrado';

  const now = new Date();
  const months = Math.max(
    1,
    (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth(),
  );

  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'} de uso`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} ${years === 1 ? 'año' : 'años'}${rest ? ` y ${rest} meses` : ''} de uso`;
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
      ? 'Mantenimiento pendiente'
      : status === 'soon'
        ? 'Servicio próximo'
        : 'Mantenimiento al día';

  const detail =
    status === 'due'
      ? `Toca revisar en ${remainingKm.toLocaleString('es-DO')} km`
      : status === 'soon'
        ? `Próximo servicio en ${remainingKm.toLocaleString('es-DO')} km`
        : `Próximo servicio en ${remainingKm.toLocaleString('es-DO')} km`;

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
