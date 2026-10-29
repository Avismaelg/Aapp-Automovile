import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  currentUser,
  vehicles as seedVehicles,
  type Vehicle,
} from '@/src/data/mock';

const STORAGE_KEY = 'caravana.demo.vehicles';

function normalizeStoredVehicle(vehicle: Vehicle): Vehicle {
  const seed = seedVehicles.find((item) => item.id === vehicle.id);

  return {
    ...vehicle,
    ownerId: vehicle.ownerId ?? seed?.ownerId ?? currentUser.id,
    ownerUsername: vehicle.ownerUsername ?? seed?.ownerUsername ?? currentUser.username,
    ownerName: vehicle.ownerName ?? seed?.ownerName ?? currentUser.name,
    acquiredAt: vehicle.acquiredAt ?? seed?.acquiredAt ?? new Date().toISOString(),
  };
}

type DemoGarageState = {
  vehicles: Vehicle[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addVehicle: (vehicle: Vehicle) => Promise<void>;
  updateVehicle: (vehicleId: string, patch: Partial<Vehicle>) => Promise<void>;
  setOdometer: (vehicleId: string, odometerKm: number) => Promise<void>;
  setPhoto: (vehicleId: string, photoUrl: string | null) => Promise<void>;
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
          set({
            vehicles: (stored as Vehicle[]).map(normalizeStoredVehicle),
            hydrated: true,
          });
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

  updateVehicle: async (vehicleId, patch) => {
    const next = get().vehicles.map((vehicle) =>
      vehicle.id === vehicleId ? { ...vehicle, ...patch } : vehicle,
    );

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

  setPhoto: async (vehicleId, photoUrl) => {
    const next = get().vehicles.map((vehicle) =>
      vehicle.id === vehicleId ? { ...vehicle, photoUrl } : vehicle,
    );

    set({ vehicles: next, hydrated: true });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },
}));
