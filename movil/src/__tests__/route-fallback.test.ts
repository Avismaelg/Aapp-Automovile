import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { fetchStreetRoutes } from '@/src/lib/graphhopper';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

const origin = { latitude: 18.4861, longitude: -69.9312 };
const stop = { latitude: 18.47, longitude: -69.9 };
const destination = { latitude: 18.45, longitude: -69.88 };

describe('SW-08 / RNF-14: GraphHopper → OSRM → línea directa', () => {
  it('si ningún motor responde devuelve la línea directa marcada como fallback', async () => {
    global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as typeof fetch;
    const routes = await fetchStreetRoutes({ origin, destination, stops: [stop] });
    expect(routes).toHaveLength(1);
    expect(routes[0].source).toBe('fallback');
    expect(routes[0].coordinates).toEqual([
      [origin.latitude, origin.longitude],
      [stop.latitude, stop.longitude],
      [destination.latitude, destination.longitude],
    ]);
    expect(routes[0].distanceM).toBeGreaterThan(0);
    expect(routes[0].timeMs).toBeGreaterThan(0);
  });

  it('si el usuario cancela no se inventa una ruta', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn(() => {
      controller.abort();
      return Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    }) as typeof fetch;
    await expect(
      fetchStreetRoutes({ origin, destination, signal: controller.signal }),
    ).rejects.toBeTruthy();
  });
});
