import { t } from '@/src/i18n';

// RF-09: datos de un repostaje o carga tal como los escribe el usuario. Se
// guardan siempre en litros (o kWh) y km; los galones se convierten aquí.

export const LITERS_PER_GALLON = 3.785411784;
export type VolumeUnit = 'L' | 'gal';

export function toLiters(amount: number, unit: VolumeUnit) {
  return unit === 'gal' ? amount * LITERS_PER_GALLON : amount;
}

export function fromLiters(liters: number, unit: VolumeUnit) {
  return unit === 'gal' ? liters / LITERS_PER_GALLON : liters;
}

// Fecha local «AAAA-MM-DD» de un instante.
export function localDateInput(at: Date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export type FuelEntryCheck = {
  odometerKm: number;
  amount: number;
  total: number;
  date: string;
  // Odómetro del registro anterior del mismo vehículo (por fecha), si lo hay.
  previousOdometerKm: number | null;
  // Odómetro del registro siguiente (al editar uno antiguo), si lo hay.
  nextOdometerKm?: number | null;
  electric: boolean;
  now?: number;
};

// Devuelve la fecha en ISO o el primer error que impide guardar.
export function validateFuelEntry(entry: FuelEntryCheck): { ok: true; filledAt: string } | { ok: false; error: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry.date.trim());
  if (!match) return { ok: false, error: t('Usa una fecha con formato AAAA-MM-DD.') };
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (day.getMonth() !== Number(match[2]) - 1 || day.getDate() !== Number(match[3])) {
    return { ok: false, error: t('Esa fecha no existe.') };
  }
  const now = entry.now ?? Date.now();
  if (day.getTime() - 12 * 3_600_000 > now) {
    return { ok: false, error: t('La fecha no puede ser futura.') };
  }
  if (!(entry.odometerKm > 0)) return { ok: false, error: t('Escribe los kilómetros que marca el odómetro.') };
  if (entry.previousOdometerKm != null && entry.odometerKm < entry.previousOdometerKm) {
    return { ok: false, error: t('El odómetro no puede ser menor que el registro anterior.') };
  }
  if (entry.nextOdometerKm != null && entry.odometerKm > entry.nextOdometerKm) {
    return { ok: false, error: t('El odómetro no puede ser mayor que el del registro siguiente.') };
  }
  if (!(entry.amount > 0)) {
    return { ok: false, error: entry.electric ? t('Escribe los kWh cargados.') : t('Escribe los litros repostados.') };
  }
  if (!(entry.total > 0)) return { ok: false, error: t('Escribe el importe total pagado.') };
  // Hoy se guarda con la hora actual; un día pasado, a mediodía.
  const isToday = localDateInput(new Date(now)) === entry.date.trim();
  return { ok: true, filledAt: (isToday ? new Date(now) : day).toISOString() };
}
