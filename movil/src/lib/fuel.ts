import type { FuelLog } from '@/src/types/models';

export type EfficiencyUnit = 'km_l' | 'l_100km' | 'mpg';
export type PriceUnit = 'l' | 'gal';
export type ElectricEfficiencyUnit = 'kwh_100km' | 'km_kwh';

export type FuelInput = {
  distanceKm: number;
  efficiency: number;
  efficiencyUnit: EfficiencyUnit;
  pricePerUnit: number;
  priceUnit: PriceUnit;
};

export type FuelResult = {
  liters: number;
  cost: number;
  kmPerL: number;
  lPer100km: number;
  mpg: number;
  pricePerLiter: number;
};

const LITERS_PER_US_GALLON = 3.785411784;
const KM_PER_MILE = 1.609344;
const MPG_TO_KM_PER_L = 0.425143707;

export function toKmPerL(value: number, unit: EfficiencyUnit): number {
  switch (unit) {
    case 'km_l':
      return value;
    case 'l_100km':
      return value > 0 ? 100 / value : 0;
    case 'mpg':
      return value * MPG_TO_KM_PER_L;
    default:
      return value;
  }
}

export function calculateFuel(input: FuelInput): FuelResult {
  const kmPerL = toKmPerL(input.efficiency, input.efficiencyUnit);
  const pricePerLiter =
    input.priceUnit === 'gal' ? input.pricePerUnit / LITERS_PER_US_GALLON : input.pricePerUnit;
  const liters = kmPerL > 0 ? input.distanceKm / kmPerL : 0;
  const cost = liters * pricePerLiter;

  return {
    liters,
    cost,
    kmPerL,
    lPer100km: kmPerL > 0 ? 100 / kmPerL : 0,
    mpg: kmPerL / MPG_TO_KM_PER_L,
    pricePerLiter,
  };
}

export type ElectricInput = {
  distanceKm: number;
  efficiency: number;
  efficiencyUnit: ElectricEfficiencyUnit;
  pricePerKwh: number;
};

export type ElectricResult = {
  kwh: number;
  cost: number;
  costPerKm: number;
  kwhPer100km: number;
  kmPerKwh: number;
};

/** Energía y coste de un trayecto en un vehículo eléctrico. */
export function calculateElectric(input: ElectricInput): ElectricResult {
  const kwhPer100km =
    input.efficiencyUnit === 'kwh_100km'
      ? input.efficiency
      : input.efficiency > 0
        ? 100 / input.efficiency
        : 0;
  const kwh = Math.max(0, (kwhPer100km / 100) * input.distanceKm);
  const cost = kwh * Math.max(0, input.pricePerKwh);

  return {
    kwh,
    cost,
    costPerKm: input.distanceKm > 0 ? cost / input.distanceKm : 0,
    kwhPer100km,
    kmPerKwh: kwh > 0 ? input.distanceKm / kwh : 0,
  };
}

/** Cantidad cargada o repostada, sin importar la fuente de energía. */
export function logEnergy(log: FuelLog) {
  return log.kind === 'electric' ? log.kwh ?? 0 : log.liters;
}

export function logUnit(log: FuelLog) {
  return log.kind === 'electric' ? 'kWh' : 'L';
}

export function logPriceUnit(log: FuelLog) {
  return log.kind === 'electric' ? '/kWh' : '/L';
}

export function distanceToMiles(km: number) {
  return km / KM_PER_MILE;
}

export function gallonsToLiters(gallons: number) {
  return gallons * LITERS_PER_US_GALLON;
}

/** Consumo real entre dos repostajes de tanque lleno. */
export function consumptionBetweenFillups(
  previousOdometerKm: number,
  currentOdometerKm: number,
  liters: number,
): { kmPerL: number; lPer100km: number; mpg: number } {
  const distance = currentOdometerKm - previousOdometerKm;
  if (distance <= 0 || liters <= 0) {
    return { kmPerL: 0, lPer100km: 0, mpg: 0 };
  }
  const kmPerL = distance / liters;
  return {
    kmPerL,
    lPer100km: 100 / kmPerL,
    mpg: kmPerL / MPG_TO_KM_PER_L,
  };
}
