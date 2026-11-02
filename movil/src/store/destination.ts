import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { insertStop } from '@/src/lib/stops';

export type ChosenDestination = {
  latitude: number;
  longitude: number;
  label: string;
  // Solo tuyo (ir a por tu coche, un reto, una prueba): no se comparte con
  // el convoy.
  personal?: boolean;
  // Siguiendo a un piloto del convoy: el destino se mueve con él.
  followId?: string;
};

export type RouteStop = { latitude: number; longitude: number; label: string };

type DestinationState = {
  destination: ChosenDestination | null;
  // Paradas en orden antes del destino.
  stops: RouteStop[];
  recents: ChosenDestination[];
  isNavigating: boolean;
  setDestination: (destination: ChosenDestination) => void;
  clearDestination: () => void;
  // Mete la parada donde menos alarga el viaje (desde `from`).
  addStop: (stop: RouteStop, from: { latitude: number; longitude: number }) => void;
  removeStop: (index: number) => void;
  startNavigation: () => void;
  stopNavigation: () => void;
};

// Destino persistido en el dispositivo: al reabrir la app (incluso sin
// conexión) sigue apareciendo el último destino elegido.
export const useChosenDestination = create<DestinationState>()(
  persist(
    (set) => ({
      destination: null,
      stops: [],
      recents: [],
      isNavigating: false,
      setDestination: (destination) =>
        set((state) => ({
          destination,
          // Tu coche, un reto o seguir a alguien no van a «recientes».
          recents: destination.personal
            ? state.recents
            : [
            { latitude: destination.latitude, longitude: destination.longitude, label: destination.label },
            ...state.recents.filter(
              (item) =>
                !(
                  item.label === destination.label &&
                  Math.abs(item.latitude - destination.latitude) < 0.00005 &&
                  Math.abs(item.longitude - destination.longitude) < 0.00005
                ),
            ),
          ].slice(0, 4),
        })),
      clearDestination: () => set({ destination: null, stops: [], isNavigating: false }),
      addStop: (stop, from) =>
        set((state) =>
          state.destination
            ? { stops: insertStop(from, state.stops, state.destination, stop) }
            : // Sin destino, la «parada» pasa a ser el destino.
              { destination: { ...stop } },
        ),
      removeStop: (index) =>
        set((state) => ({ stops: state.stops.filter((_, i) => i !== index) })),
      startNavigation: () => set({ isNavigating: true }),
      stopNavigation: () => set({ isNavigating: false }),
    }),
    {
      name: 'caravana.destination.v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Seguir a alguien no se guarda: al reabrir, su posición ya sería vieja.
      partialize: (state) => ({
        destination: state.destination?.followId ? null : state.destination,
        stops: state.destination?.followId ? [] : state.stops,
        recents: state.recents,
      }),
    },
  ),
);
