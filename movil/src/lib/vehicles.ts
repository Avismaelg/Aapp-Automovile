import { Ionicons } from '@expo/vector-icons';

import type { Vehicle, VehicleKind } from '@/src/types/models';
import { colors } from '@/src/theme';
import { formatDecimal, t } from '@/src/i18n';

export const vehicleKindMeta: Record<
  VehicleKind,
  {
    label: string;
    shortLabel: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    energyLabel: string;
    efficiencyLabel: string;
  }
> = {
  car: {
    label: t('Coche'),
    shortLabel: t('Coche'),
    icon: 'car-sport',
    color: colors.accent,
    energyLabel: 'L',
    efficiencyLabel: 'km/L',
  },
  motorcycle: {
    label: t('Motocicleta'),
    shortLabel: t('Moto'),
    icon: 'bicycle',
    color: colors.lime,
    energyLabel: 'L',
    efficiencyLabel: 'km/L',
  },
  ev: {
    label: t('Eléctrico'),
    shortLabel: 'EV',
    icon: 'flash',
    color: colors.cyan,
    energyLabel: 'kWh',
    efficiencyLabel: t('kWh/100 km'),
  },
  truck: {
    label: t('Camión / pickup'),
    shortLabel: t('Camión'),
    icon: 'bus',
    color: '#FFB84D',
    energyLabel: 'L',
    efficiencyLabel: 'km/L',
  },
};

export const vehicleKinds: VehicleKind[] = ['car', 'motorcycle', 'ev', 'truck'];

export function isElectric(vehicle: Pick<Vehicle, 'kind'>) {
  return vehicle.kind === 'ev';
}

export function vehicleEfficiency(vehicle: Vehicle) {
  return `${formatDecimal(vehicle.efficiency, 1)} ${vehicleKindMeta[vehicle.kind].efficiencyLabel}`;
}

export function vehicleFuelLabel(vehicle: Vehicle) {
  if (vehicle.kind === 'ev') return t('100 % eléctrico');
  if (vehicle.fuel === 'diesel') return t('Diésel');
  return t('Gasolina');
}

export function vehicleCategoryLabel(category: VehicleKind | 'mixed') {
  if (category === 'mixed') return t('Mixto');
  return vehicleKindMeta[category].label;
}
