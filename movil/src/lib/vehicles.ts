import { Ionicons } from '@expo/vector-icons';

import type { Vehicle, VehicleKind } from '@/src/data/mock';
import { colors } from '@/src/theme';

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
    label: 'Coche',
    shortLabel: 'Coche',
    icon: 'car-sport',
    color: colors.accent,
    energyLabel: 'L',
    efficiencyLabel: 'km/L',
  },
  motorcycle: {
    label: 'Motocicleta',
    shortLabel: 'Moto',
    icon: 'bicycle',
    color: colors.lime,
    energyLabel: 'L',
    efficiencyLabel: 'km/L',
  },
  ev: {
    label: 'Eléctrico',
    shortLabel: 'EV',
    icon: 'flash',
    color: colors.cyan,
    energyLabel: 'kWh',
    efficiencyLabel: 'kWh/100 km',
  },
  truck: {
    label: 'Camión / pickup',
    shortLabel: 'Camión',
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
  return `${vehicle.efficiency.toFixed(1).replace('.', ',')} ${vehicleKindMeta[vehicle.kind].efficiencyLabel}`;
}

export function vehicleFuelLabel(vehicle: Vehicle) {
  if (vehicle.kind === 'ev') return '100 % eléctrico';
  if (vehicle.fuel === 'diesel') return 'Diésel';
  return 'Gasolina';
}

export function vehicleCategoryLabel(category: VehicleKind | 'mixed') {
  if (category === 'mixed') return 'Mixto';
  return vehicleKindMeta[category].label;
}
