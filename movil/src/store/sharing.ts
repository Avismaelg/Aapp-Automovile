import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SharingState = {
  // null = aún no se ha preguntado.
  shareWithFriends: boolean | null;
  setShareWithFriends: (value: boolean) => void;
  reset: () => void;
};

// Si tus amigos ven tu posición en su mapa (fuera de una party). Se pregunta
// una vez, la primera vez que tienes amigos; se cambia en Perfil.
export const useSharing = create<SharingState>()(
  persist(
    (set) => ({
      shareWithFriends: null,
      setShareWithFriends: (value) => set({ shareWithFriends: value }),
      reset: () => set({ shareWithFriends: null }),
    }),
    {
      name: 'caravana-sharing',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
