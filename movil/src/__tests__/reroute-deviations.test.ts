import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { WorldMapRoute } from '@/src/lib/map/protocol';

// Varios desvíos seguidos sobre la misma ruta (petición del 2026-11-05): cada
// desvío recalcula desde donde estás; sin red se sigue con la última ruta por
// calles (MAPA-28) y, al volver la red, se recalcula sola.

type Point = { latitude: number; longitude: number };
type Call = { origin: Point; destination: Point };
const mockCalls: Call[] = [];
let mockMode: 'online' | 'fallback' | 'network-error' = 'online';

const mockStreet = (origin: Point, n: number): WorldMapRoute => ({
  coordinates: [
    [origin.latitude, origin.longitude],
    [18.47, -69.9],
  ],
  distanceM: 3000 - n * 100,
  timeMs: 300_000,
  source: 'google',
  instructions: [{ text: `ruta ${n}`, icon: 'straight', distanceM: 0 } as never],
});

jest.mock('@/src/lib/graphhopper', () => ({
  isGraphHopperConfigured: false,
  fetchStreetRoutes: jest.fn(async ({ origin, destination }: Call) => {
    mockCalls.push({ origin, destination });
    if (mockMode === 'network-error') throw new TypeError('Network request failed');
    if (mockMode === 'fallback') {
      return [{ coordinates: [[origin.latitude, origin.longitude], [destination.latitude, destination.longitude]], distanceM: 1, timeMs: 1, source: 'fallback' }];
    }
    return [mockStreet(origin, mockCalls.length)];
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createChannel } = require('@/src/hooks/useGraphHopperRoute') as typeof import('@/src/hooks/useGraphHopperRoute');

const destination = { latitude: 18.47, longitude: -69.9 };
// Desvíos: cada uno 400 m más lejos de la ruta original.
const positions = [0, 1, 2, 3, 4, 5].map((i) => ({ latitude: 18.45 + i * 0.002, longitude: -69.93 - i * 0.004 }));

async function settle() {
  // 700 ms de espera de la petición + la promesa de la ruta.
  await jest.advanceTimersByTimeAsync(800);
}

describe('recálculo tras varios desvíos', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCalls.length = 0;
    mockMode = 'online';
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('cada desvío recalcula desde la posición actual y sin red se conserva la ruta', async () => {
    const channel = createChannel();
    channel.request(positions[0], destination);
    await settle();
    expect(channel.store.getState().routes[0]?.source).toBe('google');

    // 3 desvíos con red: la pantalla manda la posición nueva y, fuera de
    // ruta, fuerza el recálculo (retryRoute).
    for (const at of [1, 2, 3]) {
      channel.request(positions[at], destination);
      channel.retry();
      await settle();
      const state = channel.store.getState();
      expect(mockCalls.at(-1)?.origin).toEqual(positions[at]);
      expect(state.routes[0]?.coordinates[0]).toEqual([positions[at].latitude, positions[at].longitude]);
      expect(state.keptOffline).toBe(false);
    }
    const lastStreet = channel.store.getState().routes[0];

    // 4.º desvío sin red: la cadena acaba en la línea directa → se sigue con
    // la última ruta por calles (antes se perdía la guía).
    mockMode = 'fallback';
    channel.request(positions[4], destination);
    channel.retry();
    await settle();
    expect(mockCalls.at(-1)?.origin).toEqual(positions[4]);
    expect(channel.store.getState().routes[0]).toBe(lastStreet);
    expect(channel.store.getState().keptOffline).toBe(true);

    // 5.º desvío, error de red: igual.
    mockMode = 'network-error';
    channel.request(positions[5], destination);
    channel.retry();
    await settle();
    expect(channel.store.getState().routes[0]).toBe(lastStreet);
    expect(channel.store.getState().keptOffline).toBe(true);

    // Vuelve la red: el reintento automático (8–15 s) recalcula desde donde
    // estás y quita el aviso.
    mockMode = 'online';
    const before = mockCalls.length;
    await jest.advanceTimersByTimeAsync(16_000);
    expect(mockCalls.length).toBeGreaterThan(before);
    const state = channel.store.getState();
    expect(state.keptOffline).toBe(false);
    expect(state.routes[0]?.source).toBe('google');
    expect(state.routes[0]).not.toBe(lastStreet);
  });

  it('un destino nuevo sin red no hereda la ruta del destino anterior', async () => {
    const channel = createChannel();
    channel.request(positions[0], destination);
    await settle();
    mockMode = 'fallback';
    channel.request(positions[1], { latitude: 18.5, longitude: -69.95 });
    await settle();
    const state = channel.store.getState();
    expect(state.keptOffline).toBe(false);
    expect(state.routes[0]?.source).toBe('fallback');
  });
});
