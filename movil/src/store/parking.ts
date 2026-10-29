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
  // Último viaje cuyo final ya se usó como aparcamiento; evita volver a
  // poner un aparcamiento que el usuario borró.
  seenTripId: string | null;
  setSpot: (spot: ParkingSpot) => void;
  clearSpot: () => void;
  markTripSeen: (tripId: string) => void;
};

// Última ubicación donde el coche quedó aparcado. Persistida en el
// dispositivo para poder volver a ella aunque se cierre la app.
export const useParking = create<ParkingState>()(
  persist(
    (set) => ({
      spot: null,
      seenTripId: null,
      setSpot: (spot) => set({ spot }),
      clearSpot: () => set({ spot: null }),
      markTripSeen: (tripId) => set({ seenTripId: tripId }),
    }),
    {
      name: 'caravana.parking.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
