import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { useAuth } from '@/src/store/auth';
import { useChatRead } from '@/src/store/chat-read';
import { useChosenDestination } from '@/src/store/destination';
import { useLocalEvents } from '@/src/store/events';
import { useFollow } from '@/src/store/follow';
import { useParking } from '@/src/store/parking';
import { useSharing } from '@/src/store/sharing';
import { useSignupDraft } from '@/src/store/signup-draft';
import { claimTripsFor, useTrips, type Trip } from '@/src/store/trips';

// Fase 2 · 2.6: al cerrar sesión lo guardado en el teléfono de esa cuenta
// (Casa, Trabajo, recientes, coche aparcado, a quién sigues) no lo hereda la
// siguiente, y el teléfono deja de recibir sus avisos.

const mockCalls: string[] = [];
const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key);
    },
    getAllKeys: async () => [...mockStorage.keys()],
    multiGet: async (keys: string[]) => keys.map((key) => [key, mockStorage.get(key) ?? null]),
    multiRemove: async (keys: string[]) => {
      for (const key of keys) mockStorage.delete(key);
    },
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
const trip: Trip = {
  id: 't_1',
  startedAt: 1,
  endedAt: 600_001,
  distanceM: 5_000,
  maxSpeedKmh: 60,
  avgSpeedKmh: 30,
  points: [],
};
const tripTotals = { drives: 1, distanceM: 5_000, durationMs: 600_000 };

function fillLocalState() {
  useFollow.getState().follow({ id: 'friend', name: 'Ana' });
  useParking.setState({ spot: { latitude: 18.48, longitude: -69.93, at: 1 } });
  const destination = useChosenDestination.getState();
  destination.setFavorite('home', place);
  destination.setDestination({ ...place, label: 'Trabajo' });
  useSharing.getState().setShareWithFriends(true);
  useChatRead.getState().markRead('party', 7);
  useSignupDraft.getState().update({ email: 'ana@example.com', step: 2 });
  useSignupDraft.getState().setPendingPhoto({ uri: 'file://foto.jpg', mime: 'image/jpeg' });
  useLocalEvents.getState().addEvent({
    id: 'e1',
    title: 'Quedada',
    description: null,
    startsAt: null,
    hostName: 'Ana',
    latitude: null,
    longitude: null,
    locationLabel: null,
    route: null,
    createdAt: '2026-11-10T00:00:00.000Z',
    isLocal: true,
    pendingSync: true,
  });
  useTrips.setState({ trips: [trip], totals: tripTotals, active: null });
}

function expectLocalStateCleared() {
  expect(useFollow.getState().target).toBeNull();
  expect(useParking.getState().spot).toBeNull();
  const destination = useChosenDestination.getState();
  expect(destination.destination).toBeNull();
  expect(destination.favorites).toEqual({});
  expect(destination.recents).toEqual([]);
  // Auditoría final · A1: tampoco los eventos sin subir, si compartes con
  // amigos, lo leído del chat ni el borrador del registro.
  expect(useLocalEvents.getState().events).toEqual([]);
  expect(useSharing.getState().shareWithFriends).toBeNull();
  expect(useChatRead.getState().lastRead).toEqual({});
  expect(useSignupDraft.getState().email).toBe('');
  expect(useSignupDraft.getState().step).toBe(1);
  expect(useSignupDraft.getState().pendingPhoto).toBeNull();
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
    // La cuenta ya no existe: sus viajes (solo están en el teléfono) se borran.
    expect(useTrips.getState().trips).toEqual([]);
    expect(useTrips.getState().totals.drives).toBe(0);
  });
});

describe('A1 · los viajes son de quien los grabó', () => {
  beforeEach(() => {
    mockStorage.clear();
    useTrips.setState({ trips: [trip], totals: tripTotals, active: null });
  });

  it('cerrar sesión y volver a entrar con la misma cuenta los conserva', async () => {
    await claimTripsFor('ana');
    await useAuth.getState().signOut();
    expect(useTrips.getState().trips).toHaveLength(1);
    await claimTripsFor('ana');
    expect(useTrips.getState().trips).toHaveLength(1);
  });

  it('otra cuenta en el mismo teléfono no los hereda', async () => {
    await claimTripsFor('ana');
    await useAuth.getState().signOut();
    await claimTripsFor('luis');
    expect(useTrips.getState().trips).toEqual([]);
    expect(useTrips.getState().totals).toEqual({ drives: 0, distanceM: 0, durationMs: 0 });
    // Y a partir de ahí son de la nueva.
    useTrips.setState({ trips: [trip] });
    await claimTripsFor('luis');
    expect(useTrips.getState().trips).toHaveLength(1);
  });

  it('sin dueño guardado (instalación anterior) se quedan con quien entra', async () => {
    await claimTripsFor('ana');
    expect(useTrips.getState().trips).toHaveLength(1);
  });
});
