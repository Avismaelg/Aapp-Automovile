import { create } from 'zustand';

export type ChosenDestination = {
  latitude: number;
  longitude: number;
  label: string;
};

type DestinationState = {
  destination: ChosenDestination | null;
  setDestination: (destination: ChosenDestination) => void;
  clearDestination: () => void;
};

// Destino que el usuario busca en el mapa. Vive en memoria: al cerrar la app
// se pierde; el destino de la party se guarda en Supabase.
export const useChosenDestination = create<DestinationState>((set) => ({
  destination: null,
  setDestination: (destination) => set({ destination }),
  clearDestination: () => set({ destination: null }),
}));
