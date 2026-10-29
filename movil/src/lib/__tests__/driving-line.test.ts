import { describe, expect, it } from '@jest/globals';

import { buildDrivingLine, levelFor, recommendedSpeeds, resampleAhead } from '@/src/lib/driving-line';

type LatLng = [number, number];

// ~111,2 m por milésima de grado de latitud.
const north = (meters: number, lat = 18.47, lng = -69.9): LatLng => [lat + meters / 111_195, lng];

// Recta de 400 m hacia el norte y giro de 90° hacia el este con radio ~15 m.
function straightThenTurn(): LatLng[] {
  const points: LatLng[] = [];
  for (let m = 0; m <= 400; m += 50) points.push(north(m));
  const [lat0, lng0] = north(400);
  const radius = 15;
  const metersPerLng = 111_195 * Math.cos((lat0 * Math.PI) / 180);
  for (let step = 1; step <= 6; step += 1) {
    const angle = (step / 6) * (Math.PI / 2);
    points.push([
      lat0 + (radius * Math.sin(angle)) / 111_195,
      lng0 + (radius * (1 - Math.cos(angle))) / metersPerLng,
    ]);
  }
  const last = points[points.length - 1];
  for (let m = 50; m <= 300; m += 50) points.push([last[0], last[1] + m / metersPerLng]);
  return points;
}

describe('línea de conducción', () => {
  it('remuestrea la ruta cada 10 m', () => {
    const samples = resampleAhead([north(0), north(100)], 0);
    expect(samples).toHaveLength(11);
    expect(samples[10][0]).toBeCloseTo(north(100)[0], 6);
  });

  it('en recta recomienda el límite y en la curva cerrada bastante menos', () => {
    const route = straightThenTurn();
    const samples = resampleAhead(route, 0);
    const speeds = recommendedSpeeds(samples, 80);
    expect(speeds[0]).toBeCloseTo(80, 0);
    expect(Math.min(...speeds)).toBeLessThan(30);
  });

  it('pide frenar si vas rápido hacia la curva y avisa de ella', () => {
    const line = buildDrivingLine(straightThenTurn(), 0, 80, 80);
    const levels = line.data.features.map((feature) => feature.properties?.level);
    expect(levels[0]).toBe('go');
    expect(levels).toContain('brake');
    expect(line.nextCurve).not.toBeNull();
    expect(line.nextCurve!.distanceM).toBeGreaterThan(300);
    expect(line.nextCurve!.distanceM).toBeLessThan(460);
    expect(line.nextCurve!.speedKmh).toBeLessThan(35);
  });

  it('despacio todo va en azul', () => {
    const line = buildDrivingLine(straightThenTurn(), 0, 15, 80);
    expect(line.data.features.every((feature) => feature.properties?.level === 'go')).toBe(true);
  });

  it('clasifica por exceso sobre la recomendada', () => {
    expect(levelFor(50, 50)).toBe('go');
    expect(levelFor(60, 50)).toBe('ease');
    expect(levelFor(70, 50)).toBe('brake');
  });
});
