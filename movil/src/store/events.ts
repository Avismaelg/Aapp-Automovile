import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AppEvent } from '@/src/lib/events';

type LocalEventsState = {
  events: AppEvent[];
  addEvent: (event: AppEvent) => void;
  removeEvent: (id: string) => void;
  markSynced: (id: string) => void;
};

const MAX_LOCAL_EVENTS = 50;

// Eventos guardados en el dispositivo: funcionan sin conexión y aunque la
// tabla remota aún no exista. Los públicos llegan de Supabase y se fusionan.
export const useLocalEvents = create<LocalEventsState>()(
  persist(
    (set) => ({
      events: [],

      addEvent: (event) =>
        set((state) => ({
          events: [event, ...state.events.filter((item) => item.id !== event.id)].slice(
            0,
            MAX_LOCAL_EVENTS,
          ),
        })),

      removeEvent: (id) =>
        set((state) => ({ events: state.events.filter((event) => event.id !== id) })),

      markSynced: (id) =>
        set((state) => ({
          events: state.events.map((event) =>
            event.id === id ? { ...event, pendingSync: false } : event,
          ),
        })),
    }),
    {
      name: 'caravana.events.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ events: state.events }),
    },
  ),
);
