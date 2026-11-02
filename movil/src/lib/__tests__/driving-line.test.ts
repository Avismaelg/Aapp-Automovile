import { describe, expect, it } from '@jest/globals';

import { buildDrivingLine, curveZones, levelFor, nextCurveAhead, recommendedSpeeds, resampleAhead } from '@/src/lib/driving-line';

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

  it('pide frenar si vas rápido: la curva se pinta centrada en su punto más lento', () => {
    const line = buildDrivingLine(straightThenTurn(), 0, 80, 80);
    const curves = line.data.features.filter((feature) => feature.properties?.kind === 'curve');
    const badges = line.data.features.filter((feature) => feature.properties?.kind === 'badge');
    expect(curves).toHaveLength(1);
    expect(curves[0].properties?.level).toBe('brake');
    expect(badges).toHaveLength(1);
    expect(Number(badges[0].properties?.speed)).toBeLessThan(35);
    // El disco está en el centro de la zona (ahí el degradado es rojo).
    const coords = (curves[0].geometry as GeoJSON.LineString).coordinates;
    const middle = coords[Math.floor(coords.length / 2)];
    const badge = (badges[0].geometry as GeoJSON.Point).coordinates;
    expect(Math.abs(middle[0] - badge[0])).toBeLessThan(0.0002);
    expect(Math.abs(middle[1] - badge[1])).toBeLessThan(0.0002);
    expect(line.nextCurve).not.toBeNull();
    expect(line.nextCurve!.distanceM).toBeGreaterThan(300);
    expect(line.nextCurve!.distanceM).toBeLessThan(460);
    expect(line.nextCurve!.speedKmh).toBeLessThan(35);
  });

  it('el resto de la ruta no se pinta: solo las curvas', () => {
    const line = buildDrivingLine(straightThenTurn(), 0, 80, 80);
    const curve = line.data.features.find((feature) => feature.properties?.kind === 'curve')!;
    // Unos 130 m alrededor de la curva, no los 700 m por delante.
    expect((curve.geometry as GeoJSON.LineString).coordinates.length).toBeLessThan(35);
  });

  it('dos curvas encadenadas muestran un solo disco, el más lento', () => {
    // A 80 km/h: curva a 40, 60 m de recta (6 muestras) y curva a 30.
    const speeds = [...Array(10).fill(80), ...Array(5).fill(40), ...Array(6).fill(80), ...Array(5).fill(30), ...Array(10).fill(80)];
    const zones = curveZones(speeds, 80);
    expect(zones).toHaveLength(1);
    expect(speeds[zones[0].peak]).toBe(30);
  });

  it('curvas separadas: cada una con su disco y su propia velocidad', () => {
    // La segunda curva (30) ya no le roba el disco a la primera (40).
    const speeds = [...Array(10).fill(80), ...Array(5).fill(40), ...Array(9).fill(80), ...Array(5).fill(30), ...Array(10).fill(80)];
    const zones = curveZones(speeds, 80);
    expect(zones.map((zone) => speeds[zone.peak])).toEqual([40, 30]);
  });

  it('el aviso de arriba y el disco del mapa dicen la misma velocidad', () => {
    const line = buildDrivingLine(straightThenTurn(), 0, 80, 80);
    const badge = line.data.features.find((feature) => feature.properties?.kind === 'badge')!;
    expect(String(line.nextCurve?.speedKmh)).toBe(badge.properties?.speed);
  });

  it('con una frenada larga, el aviso dice la velocidad de la curva, no la de la rampa', () => {
    // 80 km/h, frenada de 200 m hasta 25 km/h en la curva y vuelta a 80.
    const ramp = Array.from({ length: 20 }, (_, i) => 69 - i * 2.2);
    const speeds = [...Array(10).fill(80), ...ramp, 25, 25, 25, ...[...ramp].reverse(), ...Array(10).fill(80)];
    const curve = nextCurveAhead(speeds, 80, 80);
    expect(curve?.speedKmh).toBe(25);
    expect(curve?.distanceM).toBe(300);
  });

  it('despacio no hay aviso de curva', () => {
    const line = buildDrivingLine(straightThenTurn(), 0, 15, 80);
    expect(line.data.features).toHaveLength(0);
  });

  it('clasifica por exceso sobre la recomendada', () => {
    expect(levelFor(50, 50)).toBe('go');
    expect(levelFor(60, 50)).toBe('ease');
    expect(levelFor(70, 50)).toBe('brake');
  });
});
