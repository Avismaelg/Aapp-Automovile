import { describe, expect, it } from '@jest/globals';

import { intervalsFromCongestion, trafficGradient, trafficSpans } from '@/src/lib/route-traffic';

// Recta de 4 tramos iguales hacia el norte ([lng, lat]).
const LINE: [number, number][] = [
  [-69.9, 18.40],
  [-69.9, 18.41],
  [-69.9, 18.42],
  [-69.9, 18.43],
  [-69.9, 18.44],
];

describe('tráfico de la ruta', () => {
  it('convierte índices en fracciones de la ruta', () => {
    const spans = trafficSpans(LINE, [{ start: 1, end: 3, level: 'heavy' }]);
    expect(spans).toHaveLength(1);
    expect(spans[0].from).toBeCloseTo(0.25, 3);
    expect(spans[0].to).toBeCloseTo(0.75, 3);
  });

  it('une tramos seguidos del mismo nivel y descarta solapes', () => {
    const spans = trafficSpans(LINE, [
      { start: 0, end: 1, level: 'moderate' },
      { start: 1, end: 2, level: 'moderate' },
      { start: 1, end: 3, level: 'heavy' },
      { start: 3, end: 9, level: 'heavy' },
    ]);
    expect(spans.map((span) => span.level)).toEqual(['moderate', 'heavy']);
    expect(spans[0].to).toBeCloseTo(0.5, 3);
    expect(spans[1].to).toBeCloseTo(1, 3);
  });

  it('lee la congestión de Mapbox', () => {
    expect(intervalsFromCongestion(['low', 'heavy', 'heavy', 'unknown', 'severe'])).toEqual([
      { start: 1, end: 3, level: 'heavy' },
      { start: 4, end: 5, level: 'severe' },
    ]);
  });

  it('degradado por escalones en orden creciente', () => {
    const gradient = trafficGradient(trafficSpans(LINE, [{ start: 1, end: 2, level: 'heavy' }]), '#3d9bff') as unknown[];
    expect(gradient.slice(0, 3)).toEqual(['step', ['line-progress'], '#3d9bff']);
    expect(gradient[4]).toBe('#ef4444');
    expect(gradient[6]).toBe('#3d9bff');
    expect(gradient[3] as number).toBeLessThan(gradient[5] as number);
    expect(trafficGradient([], '#3d9bff')).toBeNull();
  });
});
