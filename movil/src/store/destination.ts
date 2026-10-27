import { create } from 'zustand';

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

// Destino que el usuario busca en el mapa. Vive en memoria: al cerrar la app
// se pierde; el destino de la party se guarda en Supabase. isNavigating activa
// la interfaz de videojuego a pantalla completa.
export const useChosenDestination = create<DestinationState>((set) => ({
  destination: null,
  isNavigating: false,
  setDestination: (destination) => set({ destination }),
  clearDestination: () => set({ destination: null, isNavigating: false }),
  startNavigation: () => set({ isNavigating: true }),
  stopNavigation: () => set({ isNavigating: false }),
}));
