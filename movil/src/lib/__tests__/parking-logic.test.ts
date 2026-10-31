import { describe, expect, it } from '@jest/globals';

import {
  evaluateStop,
  motionStateAt,
  reconcileSpotWithMotion,
  type MotionFix,
  type MotionHint,
  type StopSample,
} from '@/src/lib/parking-logic';

const LAT = 18.4861;
const LNG = -69.9312;
const T0 = 1_800_000_000_000;
// ~1 m en latitud.
const M = 0.000009;

const stop = { latitude: LAT, longitude: LNG, at: T0 };

// Genera muestras cada 5 s según un patrón [km/h, segundos], avanzando en
// línea recta desde la parada.
function track(pattern: [number, number][], from = T0): StopSample[] {
  const samples: StopSample[] = [];
  let at = from;
  let meters = 0;
  for (const [kmh, seconds] of pattern) {
    for (let s = 0; s < seconds; s += 5) {
      at += 5_000;
      meters += (kmh / 3.6) * 5;
      samples.push({ latitude: LAT + meters * M, longitude: LNG, speedKmh: kmh, at });
    }
  }
  return samples;
}

const lastAt = (samples: StopSample[]) => samples[samples.length - 1].at;

describe('evaluateStop: atascos', () => {
  const jam = track([
    [0, 120],
    [6, 20],
    [0, 90],
    [4, 30],
    [0, 150],
    [7, 15],
    [0, 60],
  ]);

  it('con el sensor diciendo «en vehículo» un tapón largo no es aparcar', () => {
    const motion: MotionHint[] = [{ type: 'vehicle', transition: 'enter', at: T0 - 600_000 }];
    expect(evaluateStop({ stop, samples: jam, motion, now: lastAt(jam) }).kind).toBe('pending');
  });

  it('sin sensor, un tapón a trompicones tampoco es aparcar', () => {
    expect(evaluateStop({ stop, samples: jam, motion: [], now: lastAt(jam) }).kind).toBe('pending');
  });

  it('sin sensor, avanzar a paso de tortuga 150 m en el tapón no cuenta como alejarse andando', () => {
    const crawl = track([
      [0, 20],
      [7, 25],
      [0, 20],
      [7, 25],
      [0, 15],
      [7, 25],
      [0, 20],
      [7, 25],
      [0, 15],
      [7, 25],
    ]);
    expect(evaluateStop({ stop, samples: crawl, motion: [], now: lastAt(crawl) }).kind).toBe(
      'pending',
    );
  });

  it('sin sensor, un tapón que casi siempre avanza a 6 km/h tampoco', () => {
    const creeping = track([
      [6, 40],
      [0, 15],
      [6, 40],
      [0, 15],
      [6, 40],
      [0, 15],
      [6, 40],
    ]);
    expect(
      evaluateStop({ stop, samples: creeping, motion: [], now: lastAt(creeping) }).kind,
    ).toBe('pending');
  });

  it('al volver a pasar de 15 km/h la parada era tráfico', () => {
    const samples = track([
      [0, 60],
      [25, 10],
    ]);
    expect(evaluateStop({ stop, samples, motion: [], now: lastAt(samples) }).kind).toBe('driving');
  });

  it('semáforo: un minuto parado no decide nada', () => {
    const samples = track([[0, 60]]);
    expect(evaluateStop({ stop, samples, motion: [], now: lastAt(samples) }).kind).toBe('pending');
  });

  it('con el sensor «en vehículo», solo tras 30 min quieto se da por aparcado', () => {
    const motion: MotionHint[] = [{ type: 'vehicle', transition: 'enter', at: T0 - 60_000 }];
    const samples = track([[0, 20 * 60]]);
    expect(evaluateStop({ stop, samples, motion, now: lastAt(samples) }).kind).toBe('pending');
    const long = track([[0, 31 * 60]]);
    expect(evaluateStop({ stop, samples: long, motion, now: lastAt(long) })).toEqual({
      kind: 'parked',
      reason: 'long-stop',
    });
  });
});

describe('evaluateStop: aparcamientos reales', () => {
  it('el sensor detecta que bajas del coche', () => {
    const samples = track([[0, 30]]);
    const motion: MotionHint[] = [
      { type: 'vehicle', transition: 'enter', at: T0 - 900_000 },
      { type: 'vehicle', transition: 'exit', at: T0 + 25_000 },
    ];
    expect(evaluateStop({ stop, samples, motion, now: lastAt(samples) })).toEqual({
      kind: 'parked',
      reason: 'motion',
    });
  });

  it('el sensor dice «a pie» poco antes de que el GPS vea la parada', () => {
    const samples = track([[0, 10]]);
    const motion: MotionHint[] = [{ type: 'foot', transition: 'enter', at: T0 - 20_000 }];
    expect(evaluateStop({ stop, samples, motion, now: lastAt(samples) }).kind).toBe('parked');
  });

  it('un «a pie» de antes del viaje no cuenta', () => {
    const samples = track([[0, 30]]);
    const motion: MotionHint[] = [{ type: 'foot', transition: 'enter', at: T0 - 600_000 }];
    expect(evaluateStop({ stop, samples, motion, now: lastAt(samples) }).kind).toBe('pending');
  });

  it('parar junto al destino de la navegación', () => {
    const samples = track([[0, 50]]);
    const destination = { latitude: LAT + 60 * M, longitude: LNG };
    expect(evaluateStop({ stop, samples, motion: [], now: lastAt(samples), destination })).toEqual({
      kind: 'parked',
      reason: 'destination',
    });
  });

  it('un destino lejano no adelanta nada', () => {
    const samples = track([[0, 50]]);
    const destination = { latitude: LAT + 2_000 * M, longitude: LNG };
    expect(
      evaluateStop({ stop, samples, motion: [], now: lastAt(samples), destination }).kind,
    ).toBe('pending');
  });

  it('sin sensor: bajas y te alejas andando', () => {
    const samples = track([
      [0, 15],
      [5, 110],
    ]);
    expect(evaluateStop({ stop, samples, motion: [], now: lastAt(samples) })).toEqual({
      kind: 'parked',
      reason: 'walked-away',
    });
  });

  it('sin sensor: 10 minutos quieto en el mismo sitio', () => {
    const samples = track([[0, 10 * 60 + 5]]);
    expect(evaluateStop({ stop, samples, motion: [], now: lastAt(samples) })).toEqual({
      kind: 'parked',
      reason: 'long-stop',
    });
  });

  it('el simulador comprime los tiempos', () => {
    const samples = track([[0, 95]]);
    expect(
      evaluateStop({ stop, samples, motion: [], now: lastAt(samples), timeScale: 0.15 }).kind,
    ).toBe('parked');
  });
});

describe('motionStateAt', () => {
  it('el último aviso relevante manda', () => {
    const events: MotionHint[] = [
      { type: 'foot', transition: 'enter', at: 1 },
      { type: 'vehicle', transition: 'enter', at: 2 },
      { type: 'still', transition: 'enter', at: 3 },
    ];
    expect(motionStateAt(events, 0)).toBe('unknown');
    expect(motionStateAt(events, 1)).toBe('foot');
    expect(motionStateAt(events, 5)).toBe('vehicle');
    expect(
      motionStateAt([...events, { type: 'vehicle', transition: 'exit', at: 6 }], 7),
    ).toBe('foot');
  });
});

describe('reconcileSpotWithMotion: app cerrada', () => {
  const oldSpot = { latitude: LAT, longitude: LNG, at: T0 };
  const exitFix = (at: number, extra: Partial<MotionFix> = {}): MotionFix => ({
    type: 'vehicle',
    transition: 'exit',
    at,
    latitude: LAT + 5_000 * M,
    longitude: LNG,
    accuracy: 15,
    fixAt: at - 10_000,
    ...extra,
  });

  it('sin avisos, se mantiene', () => {
    expect(reconcileSpotWithMotion(oldSpot, [], T0 + 3_600_000).kind).toBe('keep');
  });

  it('subiste y bajaste del coche con la app cerrada: el coche está donde bajaste', () => {
    const events: MotionFix[] = [
      { type: 'vehicle', transition: 'enter', at: T0 + 600_000 },
      exitFix(T0 + 1_800_000),
    ];
    expect(reconcileSpotWithMotion(oldSpot, events, T0 + 3_600_000)).toEqual({
      kind: 'move',
      spot: { latitude: LAT + 5_000 * M, longitude: LNG, at: T0 + 1_800_000 },
    });
  });

  it('varios viajes con la app cerrada: vale la última bajada', () => {
    const events: MotionFix[] = [
      { type: 'vehicle', transition: 'enter', at: T0 + 600_000 },
      exitFix(T0 + 1_800_000),
      { type: 'vehicle', transition: 'enter', at: T0 + 2_400_000 },
      exitFix(T0 + 3_000_000, { latitude: LAT + 9_000 * M }),
    ];
    const result = reconcileSpotWithMotion(oldSpot, events, T0 + 3_600_000);
    expect(result).toEqual({
      kind: 'move',
      spot: { latitude: LAT + 9_000 * M, longitude: LNG, at: T0 + 3_000_000 },
    });
  });

  it('subiste y no hay dónde bajaste: se quita el aparcamiento viejo', () => {
    const events: MotionFix[] = [{ type: 'vehicle', transition: 'enter', at: T0 + 600_000 }];
    expect(reconcileSpotWithMotion(oldSpot, events, T0 + 900_000).kind).toBe('clear');
  });

  it('una ubicación imprecisa o vieja en la bajada no se usa', () => {
    const imprecise: MotionFix[] = [
      { type: 'vehicle', transition: 'enter', at: T0 + 600_000 },
      exitFix(T0 + 1_800_000, { accuracy: 500 }),
    ];
    expect(reconcileSpotWithMotion(oldSpot, imprecise, T0 + 3_600_000).kind).toBe('clear');
    const stale: MotionFix[] = [
      { type: 'vehicle', transition: 'enter', at: T0 + 600_000 },
      exitFix(T0 + 1_800_000, { fixAt: T0 }),
    ];
    expect(reconcileSpotWithMotion(oldSpot, stale, T0 + 3_600_000).kind).toBe('clear');
  });

  it('avisos de antes del aparcamiento no lo mueven', () => {
    const events: MotionFix[] = [
      { type: 'vehicle', transition: 'enter', at: T0 - 1_800_000 },
      exitFix(T0 - 60_000),
    ];
    expect(reconcileSpotWithMotion(oldSpot, events, T0 + 3_600_000).kind).toBe('keep');
  });

  it('sin aparcamiento previo, la bajada con ubicación crea uno', () => {
    const events: MotionFix[] = [
      { type: 'vehicle', transition: 'enter', at: T0 + 600_000 },
      exitFix(T0 + 1_800_000),
    ];
    expect(reconcileSpotWithMotion(null, events, T0 + 3_600_000).kind).toBe('move');
  });
});
