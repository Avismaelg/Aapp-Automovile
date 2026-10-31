import { create } from 'zustand';

// A quién del convoy sigues ahora (solo en memoria: al cerrar la app se deja
// de seguir).
type FollowState = {
  target: { id: string; name: string } | null;
  follow: (target: { id: string; name: string }) => void;
  stop: () => void;
};

export const useFollow = create<FollowState>((set) => ({
  target: null,
  follow: (target) => set({ target }),
  stop: () => set({ target: null }),
}));
