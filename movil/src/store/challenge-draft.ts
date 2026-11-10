import { create } from 'zustand';

import type { ChallengeCategory, VehicleKind } from '@/src/types/models';

// RETO-01: reto con meta propia. Se eligen los rivales (convoy o mapa) y la
// meta se busca en la pantalla de destino, que crea el reto al elegirla.

export type ChallengeDraft = {
  title: string;
  category: ChallengeCategory;
  hostVehicleId?: string;
  hostVehicleKind: VehicleKind;
  invitees: { userId: string; vehicleKind: VehicleKind }[];
};

export const useChallengeDraft = create<{
  draft: ChallengeDraft | null;
  start: (draft: ChallengeDraft) => void;
  clear: () => void;
}>((set) => ({
  draft: null,
  start: (draft) => set({ draft }),
  clear: () => set({ draft: null }),
}));
