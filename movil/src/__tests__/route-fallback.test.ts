import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { fetchStreetRoutes } from '@/src/lib/graphhopper';
import { isOsrmConfigured } from '@/src/lib/providers';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

const origin = { latitude: 18.4861, longitude: -69.9312 };
const stop = { latitude: 18.47, longitude: -69.9 };
const destination = { latitude: 18.45, longitude: -69.88 };

describe('SW-08 / RNF-14: cadena de rutas → línea directa (solo como aviso, sin guía)', () => {
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
    // Sin OSRM público (P2-3) puede que ningún proveedor llegue a llamar a
    // fetch: se cancela antes y aun así no debe salir la línea directa.
    const controller = new AbortController();
    controller.abort();
    global.fetch = jest.fn(() =>
      Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
    ) as typeof fetch;
    await expect(
      fetchStreetRoutes({ origin, destination, signal: controller.signal }),
    ).rejects.toBeTruthy();
  });
});

describe('P1-5 / P2-3: sin ruta real no hay guía ni servidor de demostración', () => {
  it('el OSRM público no se usa sin un servidor propio configurado', () => {
    expect(isOsrmConfigured).toBe(false);
  });

  it('la pantalla no guía ni dibuja la línea directa', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'), 'utf8') as string;
    expect(source).toContain('route.route?.source === "fallback" ? null : route.route');
    expect(source).toContain('route={streetRoute}');
    expect(source).toContain('canConfirm={!route.isLoading && Boolean(streetRoute)}');
  });
});
