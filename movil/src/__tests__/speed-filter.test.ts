import { describe, expect, it } from '@jest/globals';

import { nextSpeed, type SpeedFix, type SpeedState } from '@/src/lib/speed-filter';

const M = 1 / 111_320;
const LAT = 18.47;
const LNG = -69.93;

function run(fixes: Partial<SpeedFix>[]) {
  let state: SpeedState | null = null;
  const out: (number | null)[] = [];
  fixes.forEach((fix, index) => {
    state = nextSpeed(state, {
      latitude: LAT,
      longitude: LNG,
      speedMps: null,
      accuracyM: 8,
      at: index * 1_000,
      ...fix,
    });
    out.push(state.speedKmh == null ? null : Math.round(state.speedKmh));
  });
  return out;
}

const kmh = (value: number) => value / 3.6;

describe('Velocímetro estable', () => {
  it('a velocidad constante marca la velocidad real', () => {
    const out = run(Array.from({ length: 8 }, () => ({ speedMps: kmh(60) })));
    expect(out.slice(-3)).toEqual([60, 60, 60]);
  });

  it('quieto en un semáforo marca 0 aunque el GPS diga 2–4 km/h', () => {
    const out = run([{ speedMps: kmh(2) }, { speedMps: kmh(4) }, { speedMps: kmh(1) }, { speedMps: kmh(3.5) }]);
    expect(out.slice(1).every((value) => value === 0 || (value ?? 0) <= 2)).toBe(true);
  });

  it('un rebote de señal de 60 a 140 km/h en 1 s no se muestra', () => {
    const steady = Array.from({ length: 6 }, () => ({ speedMps: kmh(60) }));
    const out = run([...steady, { speedMps: kmh(140) }, { speedMps: kmh(60) }]);
    // Como mucho sube lo que un coche puede acelerar en 1 s.
    expect(out[6]).toBeLessThanOrEqual(72);
    expect(Math.abs((out[7] ?? 0) - 60)).toBeLessThanOrEqual(8);
  });

  it('con mala precisión no se fía del GPS y mantiene la última velocidad', () => {
    const steady = Array.from({ length: 5 }, () => ({ speedMps: kmh(50) }));
    const out = run([...steady, { speedMps: kmh(120), accuracyM: 90 }, { speedMps: kmh(5), accuracyM: 120 }]);
    expect(out[5]).toBe(50);
    expect(out[6]).toBe(50);
  });

  it('sin velocidad del GPS la calcula por distancia entre lecturas precisas', () => {
    // 15 m por segundo = 54 km/h.
    const out = run(Array.from({ length: 6 }, (_, index) => ({ latitude: LAT + index * 15 * M })));
    expect(out[out.length - 1]).toBeGreaterThanOrEqual(50);
    expect(out[out.length - 1]).toBeLessThanOrEqual(58);
  });

  it('sigue un frenazo real (de 80 a 0 en unos segundos)', () => {
    const steady = Array.from({ length: 5 }, () => ({ speedMps: kmh(80) }));
    const braking = [60, 40, 20, 5, 0, 0, 0].map((value) => ({ speedMps: kmh(value) }));
    const out = run([...steady, ...braking]);
    expect(out[out.length - 1]).toBe(0);
  });

  it('tras una pausa larga del GPS empieza de cero', () => {
    let state: SpeedState | null = null;
    state = nextSpeed(state, { latitude: LAT, longitude: LNG, speedMps: kmh(80), accuracyM: 5, at: 0 });
    state = nextSpeed(state, { latitude: LAT, longitude: LNG, speedMps: kmh(20), accuracyM: 5, at: 60_000 });
    expect(Math.round(state.speedKmh ?? 0)).toBe(20);
  });
});
