import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { vehicles as seedVehicles, type Vehicle } from '@/src/data/mock';

const STORAGE_KEY = 'caravana.demo.vehicles';

type DemoGarageState = {
  vehicles: Vehicle[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addVehicle: (vehicle: Vehicle) => Promise<void>;
  setOdometer: (vehicleId: string, odometerKm: number) => Promise<void>;
};

export const useDemoGarage = create<DemoGarageState>((set, get) => ({
  vehicles: seedVehicles,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      // Si el usuario añadió un vehículo mientras leíamos, no lo pisamos.
      if (get().hydrated) return;
      if (raw) {
        const stored = JSON.parse(raw);
        if (Array.isArray(stored)) {
          set({ vehicles: stored as Vehicle[], hydrated: true });
          return;
        }
      }
    } catch {
      // Si el almacenamiento está corrupto, seguimos con el garaje de ejemplo.
    }

    if (!get().hydrated) set({ hydrated: true });
  },

  addVehicle: async (vehicle) => {
    const current = get().vehicles;
    const next = [
      vehicle,
      ...current.map((item) => ({
        ...item,
        isPrimary: vehicle.isPrimary ? false : item.isPrimary,
      })),
    ];

    set({ vehicles: next, hydrated: true });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  setOdometer: async (vehicleId, odometerKm) => {
    const next = get().vehicles.map((vehicle) =>
      vehicle.id === vehicleId ? { ...vehicle, odometerKm } : vehicle,
    );

    set({ vehicles: next, hydrated: true });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },
}));
