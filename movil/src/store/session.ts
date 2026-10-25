import { create } from 'zustand';

import { currentUser } from '@/src/data/mock';

type SessionState = {
  user: typeof currentUser;
  trackingEnabled: boolean;
  setTrackingEnabled: (value: boolean) => void;
};

export const useSession = create<SessionState>((set) => ({
  user: currentUser,
  trackingEnabled: true,
  setTrackingEnabled: (value) => set({ trackingEnabled: value }),
}));
