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

export type FavoriteKind = 'home' | 'work';

type DestinationState = {
  destination: ChosenDestination | null;
  // MAPA-03: Casa y Trabajo, a un toque desde el buscador.
  favorites: Partial<Record<FavoriteKind, ChosenDestination>>;
  setFavorite: (kind: FavoriteKind, place: ChosenDestination | null) => void;
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

// El mismo sitio escrito distinto («Maximo Gomez» / «Máximo Gómez») o el
// mismo punto con otro nombre cuenta como uno solo en «recientes».
function sameLabel(a: string, b: string) {
  const normalize = (text: string) =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return normalize(a) === normalize(b);
}

function meters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  return Math.hypot(
    (a.latitude - b.latitude) * 110_540,
    (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180),
  );
}

export function isSamePlace(a: ChosenDestination, b: ChosenDestination) {
  const distance = meters(a, b);
  return distance < 50 || (distance < 2_000 && sameLabel(a.label, b.label));
}

export function uniqueRecents(recents: ChosenDestination[]) {
  return recents.filter((item, index) => recents.findIndex((other) => isSamePlace(other, item)) === index);
}

// Destino persistido en el dispositivo: al reabrir la app (incluso sin
// conexión) sigue apareciendo el último destino elegido.
export const useChosenDestination = create<DestinationState>()(
  persist(
    (set) => ({
      destination: null,
      favorites: {},
      setFavorite: (kind, place) =>
        set((state) => {
          const favorites = { ...state.favorites };
          if (place) favorites[kind] = { latitude: place.latitude, longitude: place.longitude, label: place.label };
          else delete favorites[kind];
          return { favorites };
        }),
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
            ...uniqueRecents(state.recents).filter((item) => !isSamePlace(item, destination)),
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
        favorites: state.favorites,
      }),
    },
  ),
);
