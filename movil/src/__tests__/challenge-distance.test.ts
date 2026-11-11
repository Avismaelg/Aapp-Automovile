import { describe, expect, it } from '@jest/globals';

import { challengeDistanceM, metersBetween } from '@/src/lib/convoy';

const from = { latitude: 18.4861, longitude: -69.9312 };
const goal = { latitude: 18.4961, longitude: -69.9312 };
const direct = metersBetween(from, goal);

describe('distancia declarada de un reto con meta', () => {
  it('sin meta no declara distancia', () => {
    expect(challengeDistanceM(from, null, 1_000, true)).toBe(0);
  });

  it('si la meta no es tu destino personal usa la línea recta, no la ruta de otro destino', () => {
    // Antes se usaba route.route.distanceM aunque la meta fuera la del convoy:
    // la ruta era de otro destino y el reto nacía con 0 km.
    expect(challengeDistanceM(from, goal, 25_000, false)).toBeCloseTo(direct, 6);
  });

  it('con ruta hacia la meta usa la ruta, pero nunca menos que la línea recta', () => {
    expect(challengeDistanceM(from, goal, direct * 1.3, true)).toBeCloseTo(direct * 1.3, 6);
    expect(challengeDistanceM(from, goal, direct * 0.5, true)).toBeCloseTo(direct, 6);
    expect(challengeDistanceM(from, goal, 0, true)).toBeCloseTo(direct, 6);
  });

  it('sin ruta o ya en la meta cae a un valor sensato', () => {
    expect(challengeDistanceM(from, goal, null, true)).toBeCloseTo(direct, 6);
    expect(challengeDistanceM(from, from, 1_000, true)).toBe(0);
  });
});
