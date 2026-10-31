import { describe, expect, it } from '@jest/globals';

import { FOLLOW_MOVE_M, followDestination, followStatus, metersBetween, type Point } from '@/src/lib/convoy';

// Sigues a Laura durante 10 minutos mientras ella conduce a 60 km/h.
describe('seguir a un piloto del convoy', () => {
  it('el destino va tras ella sin recalcular la ruta a cada segundo', () => {
    let laura: Point = { latitude: 18.47, longitude: -69.93 };
    let destination: (Point & { followId?: string }) | null = null;
    let reroutes = 0;
    let maxGap = 0;
    for (let s = 0; s < 600; s += 1) {
      laura = { latitude: laura.latitude + 16.7 / 110_540, longitude: laura.longitude };
      if (s % 3 !== 0) continue; // su posición llega cada 3 s
      const next = followDestination(destination, { id: 'laura', position: laura });
      if (next) {
        destination = { ...next, followId: 'laura' };
        reroutes += 1;
      }
      maxGap = Math.max(maxGap, metersBetween(destination!, laura));
    }
    // 10 km en 10 min: un recálculo cada ~150 m (≈ 67), no 200.
    expect(reroutes).toBeLessThan(80);
    expect(maxGap).toBeLessThan(FOLLOW_MOVE_M + 60);
  });

  it('cambiar a seguir a otro mueve el destino al momento', () => {
    const current = { latitude: 18.47, longitude: -69.93, followId: 'laura' };
    const pedro = { latitude: 18.471, longitude: -69.93 };
    expect(followDestination(current, { id: 'pedro', position: pedro })).toEqual(pedro);
  });

  it('sin posición todavía, espera', () => {
    expect(followDestination(null, { id: 'laura', position: null })).toBeNull();
  });

  it('dice a cuánto está', () => {
    const now = Date.parse('2026-10-31T15:00:00Z');
    const me = { latitude: 18.47, longitude: -69.93 };
    const seen = new Date(now - 3_000).toISOString();
    expect(followStatus(me, { latitude: 18.4704, longitude: -69.93 }, seen, now)).toBe('a tu lado');
    expect(followStatus(me, { latitude: 18.475, longitude: -69.93 }, seen, now)).toBe('a 560 m');
    expect(followStatus(me, { latitude: 18.49, longitude: -69.93 }, seen, now)).toBe('a 2,2 km');
    expect(followStatus(me, { latitude: 18.49, longitude: -69.93 }, new Date(now - 300_000).toISOString(), now)).toBe('sin señal');
  });
});
