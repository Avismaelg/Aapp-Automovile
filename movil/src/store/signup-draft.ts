import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { VehicleKind } from '@/src/types/models';

// REG-08: borrador del registro. Si se cierra la app a mitad, al volver se
// retoma en el mismo paso con lo ya escrito. La contraseña NO se guarda nunca
// (se vuelve a pedir). La foto del vehículo queda aquí hasta subirla con la
// sesión ya abierta (REG-06).

export type SignupDraft = {
  step: 1 | 2 | 3;
  firstName: string;
  lastName: string;
  nickname: string;
  email: string;
  kind: VehicleKind;
  make: string;
  model: string;
  year: string;
  color: string;
  plate: string;
  photoUri: string | null;
  photoMime: string | null;
};

export const EMPTY_DRAFT: SignupDraft = {
  step: 1,
  firstName: '',
  lastName: '',
  nickname: '',
  email: '',
  kind: 'car',
  make: '',
  model: '',
  year: '',
  color: '',
  plate: '',
  photoUri: null,
  photoMime: null,
};

type DraftState = SignupDraft & {
  update: (patch: Partial<SignupDraft>) => void;
  reset: () => void;
  // Foto pendiente tras crear la cuenta (para el vehículo principal).
  pendingPhoto: { uri: string; mime: string } | null;
  setPendingPhoto: (photo: { uri: string; mime: string } | null) => void;
};

export const useSignupDraft = create<DraftState>()(
  persist(
    (set) => ({
      ...EMPTY_DRAFT,
      pendingPhoto: null,
      update: (patch) => set(patch),
      reset: () => set({ ...EMPTY_DRAFT }),
      setPendingPhoto: (pendingPhoto) => set({ pendingPhoto }),
    }),
    {
      name: 'caravana.signup-draft.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
