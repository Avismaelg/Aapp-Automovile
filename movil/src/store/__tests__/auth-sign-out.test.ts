import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { useAuth } from '@/src/store/auth';
import { useChosenDestination } from '@/src/store/destination';
import { useFollow } from '@/src/store/follow';
import { useParking } from '@/src/store/parking';

// Fase 2 · 2.6: al cerrar sesión lo guardado en el teléfono de esa cuenta
// (Casa, Trabajo, recientes, coche aparcado, a quién sigues) no lo hereda la
// siguiente, y el teléfono deja de recibir sus avisos.

const mockCalls: string[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

jest.mock('@/src/lib/push', () => ({
  unregisterPushToken: async () => {
    mockCalls.push('unregister');
  },
}));

jest.mock('@/src/lib/supabase', () => ({
  isProductionBuild: false,
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signOut: async ({ scope }: { scope: string }) => {
        mockCalls.push(`signOut:${scope}`);
        return { error: null };
      },
    },
  },
}));

const place = { latitude: 18.48, longitude: -69.93, label: 'Casa' };

function fillLocalState() {
  useFollow.getState().follow({ id: 'friend', name: 'Ana' });
  useParking.setState({ spot: { latitude: 18.48, longitude: -69.93, at: 1 } });
  const destination = useChosenDestination.getState();
  destination.setFavorite('home', place);
  destination.setDestination({ ...place, label: 'Trabajo' });
}

function expectLocalStateCleared() {
  expect(useFollow.getState().target).toBeNull();
  expect(useParking.getState().spot).toBeNull();
  const destination = useChosenDestination.getState();
  expect(destination.destination).toBeNull();
  expect(destination.favorites).toEqual({});
  expect(destination.recents).toEqual([]);
}

describe('2.6 · cerrar sesión', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    fillLocalState();
  });

  it('borra el token de avisos antes de cerrar la sesión y limpia lo local', async () => {
    await useAuth.getState().signOut();
    expect(mockCalls).toEqual(['unregister', 'signOut:global']);
    expectLocalStateCleared();
    expect(useAuth.getState().status).toBe('unauthenticated');
  });

  it('tras borrar la cuenta también limpia lo local (el token ya lo borró el servidor)', async () => {
    await useAuth.getState().signOutLocal();
    expect(mockCalls).toEqual(['signOut:local']);
    expectLocalStateCleared();
  });
});
