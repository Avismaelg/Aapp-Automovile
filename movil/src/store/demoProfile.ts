import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { currentUser } from '@/src/data/mock';
import type { ProfilePrivacy } from '@/src/lib/profile-db';

const STORAGE_KEY = 'caravana.demo.profile';

export type DemoProfile = {
  displayName: string;
  bio: string;
  city: string;
  privacy: ProfilePrivacy;
};

const INITIAL_PROFILE: DemoProfile = {
  displayName: currentUser.name,
  bio: currentUser.bio,
  city: currentUser.city,
  privacy: 'friends',
};

type DemoProfileState = {
  profile: DemoProfile;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (profile: DemoProfile) => Promise<void>;
};

export const useDemoProfile = create<DemoProfileState>((set, get) => ({
  profile: INITIAL_PROFILE,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (get().hydrated) return;
      if (raw) {
        const stored = JSON.parse(raw) as Partial<DemoProfile>;
        set({
          profile: {
            displayName: stored.displayName?.trim() || INITIAL_PROFILE.displayName,
            bio: typeof stored.bio === 'string' ? stored.bio : INITIAL_PROFILE.bio,
            city: typeof stored.city === 'string' ? stored.city : INITIAL_PROFILE.city,
            privacy:
              stored.privacy === 'public' || stored.privacy === 'private'
                ? stored.privacy
                : 'friends',
          },
          hydrated: true,
        });
        return;
      }
    } catch {
      // Si el almacenamiento está corrupto, usamos el perfil inicial.
    }

    if (!get().hydrated) set({ hydrated: true });
  },

  update: async (profile) => {
    set({ profile, hydrated: true });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  },
}));
