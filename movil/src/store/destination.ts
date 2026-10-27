import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ChosenDestination = {
  latitude: number;
  longitude: number;
  label: string;
};

type DestinationState = {
  destination: ChosenDestination | null;
  isNavigating: boolean;
  setDestination: (destination: ChosenDestination) => void;
  clearDestination: () => void;
  startNavigation: () => void;
  stopNavigation: () => void;
};

// Destino persistido en el dispositivo: al reabrir la app (incluso sin
// conexión) sigue apareciendo el último destino elegido.
export const useChosenDestination = create<DestinationState>()(
  persist(
    (set) => ({
      destination: null,
      isNavigating: false,
      setDestination: (destination) => set({ destination }),
      clearDestination: () => set({ destination: null, isNavigating: false }),
      startNavigation: () => set({ isNavigating: true }),
      stopNavigation: () => set({ isNavigating: false }),
    }),
    {
      name: 'caravana.destination.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ destination: state.destination }),
    },
  ),
);
