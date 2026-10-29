import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { currentUser } from '@/src/data/mock';

type SessionState = {
  user: typeof currentUser;
  trackingEnabled: boolean;
  setTrackingEnabled: (value: boolean) => void;
};

// La preferencia de tracking se guarda en el dispositivo: si el usuario lo
// pausó, sigue en pausa al reabrir la app; si lo activó, se relanza solo.
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: currentUser,
      trackingEnabled: true,
      setTrackingEnabled: (value) => set({ trackingEnabled: value }),
    }),
    {
      name: 'caravana.session.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ trackingEnabled: state.trackingEnabled }),
    },
  ),
);
