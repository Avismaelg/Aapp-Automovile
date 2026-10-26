import type { FuelKind, FuelLog, Vehicle, VehicleKind } from '@/src/data/mock';
import { vehicleUrl } from '@/src/lib/qr';

export type VehicleRow = {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number | null;
  nickname: string | null;
  color: string | null;
  fuel_kind: FuelKind;
  kind: VehicleKind;
  efficiency: number | string | null;
  efficiency_unit: 'km_l' | 'kwh_100km' | null;
  odometer_km: number | string;
  is_primary: boolean;
  qr_slug: string;
};

export type FuelLogRow = {
  id: string;
  vehicle_id: string;
  filled_at: string;
  odometer_km: number | string;
  volume_l: number | string;
  price_per_l: number | string;
  total_cost: number | string;
  station: string | null;
  is_full_tank: boolean;
};

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function shortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Reciente';
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function mapFuelLogRow(row: FuelLogRow, vehicle: Vehicle): FuelLog {
  const electric = vehicle.fuel === 'electric';
  const volume = Number(row.volume_l ?? 0);

  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    kind: electric ? 'electric' : 'fuel',
    date: shortDate(row.filled_at),
    station: row.station?.trim() || (electric ? 'Carga registrada' : 'Repostaje registrado'),
    liters: electric ? 0 : volume,
    kwh: electric ? volume : undefined,
    pricePerLiter: Number(row.price_per_l ?? 0),
    total: Number(row.total_cost ?? 0),
    odometer: Number(row.odometer_km ?? 0),
    fullTank: row.is_full_tank,
  };
}

export type NewVehicleInput = {
  make: string;
  model: string;
  year: number;
  nickname?: string;
  color: string;
  kind: VehicleKind;
  fuel: FuelKind;
  efficiency: number;
  odometerKm: number;
  isPrimary?: boolean;
};

export const DEFAULT_VEHICLE_COLORS = [
  '#FF5A1F',
  '#C81D25',
  '#C9FF4D',
  '#4DE1FF',
  '#B98CFF',
  '#FFB84D',
  '#F3F6FA',
];

function fallbackEfficiency(kind: VehicleKind) {
  return kind === 'ev' ? 15.8 : 12;
}

export function mapVehicleRow(row: VehicleRow): Vehicle {
  const kind = row.kind ?? 'car';
  const efficiency = Number(row.efficiency ?? fallbackEfficiency(kind));

  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year ?? new Date().getFullYear(),
    nickname: row.nickname?.trim() || `${row.make} ${row.model}`,
    color: row.color ?? DEFAULT_VEHICLE_COLORS[0],
    odometerKm: Number(row.odometer_km ?? 0),
    kind,
    fuel: row.fuel_kind ?? (kind === 'ev' ? 'electric' : 'gasoline'),
    efficiency: Number.isFinite(efficiency) && efficiency > 0 ? efficiency : fallbackEfficiency(kind),
    efficiencyUnit: row.efficiency_unit ?? (kind === 'ev' ? 'kwh_100km' : 'km_l'),
    qrSlug: row.qr_slug,
    qr: vehicleUrl(row.qr_slug),
    isPrimary: row.is_primary,
  };
}

export function vehicleInsertPayload(ownerId: string, input: NewVehicleInput) {
  return {
    owner_id: ownerId,
    make: input.make.trim(),
    model: input.model.trim(),
    year: input.year,
    nickname: input.nickname?.trim() || null,
    color: input.color,
    kind: input.kind,
    fuel_kind: input.fuel,
    efficiency: input.efficiency,
    efficiency_unit: input.kind === 'ev' ? 'kwh_100km' : 'km_l',
    odometer_km: input.odometerKm,
    is_primary: Boolean(input.isPrimary),
  };
}

export function demoVehicleId() {
  return `v_${Date.now().toString(36)}`;
}

export function demoQrSlug(make: string, model: string) {
  const base = `${make}-${model}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

  return `${base || 'vehiculo'}-${Date.now().toString(36).slice(-4)}`;
}
