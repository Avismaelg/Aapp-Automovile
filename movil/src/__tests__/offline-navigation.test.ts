import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import { keepRouteWhenOffline } from '@/src/hooks/useGraphHopperRoute';
import type { WorldMapRoute } from '@/src/lib/map/protocol';

// MAPA-28: sin conexión, un recálculo fallido no puede quitarte la ruta.
describe('navegación sin conexión', () => {
  const destination = { latitude: 18.47, longitude: -69.9 };
  const street: WorldMapRoute = { coordinates: [[18.45, -69.93], [18.47, -69.9]], distanceM: 4000, timeMs: 400_000, source: 'google' };
  const straight: WorldMapRoute = { ...street, source: 'fallback' };

  it('con una ruta por calles al mismo destino se sigue con ella', () => {
    expect(keepRouteWhenOffline([street], destination, { latitude: 18.47001, longitude: -69.90001 })).toBe(true);
  });

  it('un destino nuevo o una ruta que ya era la línea directa no se conservan', () => {
    expect(keepRouteWhenOffline([street], destination, { latitude: 18.5, longitude: -69.9 })).toBe(false);
    expect(keepRouteWhenOffline([straight], destination, destination)).toBe(false);
    expect(keepRouteWhenOffline([], destination, destination)).toBe(false);
    expect(keepRouteWhenOffline([street], null, destination)).toBe(false);
  });

  it('la navegación sigue guiando sin red en vez de quedarse «Recalculando…»', () => {
    const hud = fs.readFileSync(path.join(__dirname, '..', 'components', 'navigation', 'NavigationHud.tsx'), 'utf8');
    expect(hud).toContain('const recalculating = !hasRoute || (offRoute && !offline);');
    const screen = fs.readFileSync(path.join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
    expect(screen).toContain('offline={route.keptOffline || !online}');
  });
});
