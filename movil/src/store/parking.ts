import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ParkingSpot = {
  latitude: number;
  longitude: number;
  at: number;
};

type ParkingState = {
  spot: ParkingSpot | null;
  setSpot: (spot: ParkingSpot) => void;
  clearSpot: () => void;
};

// Última ubicación donde el coche quedó aparcado. Persistida en el
// dispositivo para poder volver a ella aunque se cierre la app.
export const useParking = create<ParkingState>()(
  persist(
    (set) => ({
      spot: null,
      setSpot: (spot) => set({ spot }),
      clearSpot: () => set({ spot: null }),
    }),
    {
      name: 'caravana.parking.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
