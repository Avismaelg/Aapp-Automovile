import AsyncStorage from "@react-native-async-storage/async-storage";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";

import {
  saveBackgroundBatch,
  type BackgroundPoint,
} from "@/src/lib/background-points";
import { haversineMeters } from "@/src/lib/geo";
import {
  ParkingDetector,
  reconcileSpotWithMotion,
  spotFromTripEnd,
  type Spot,
} from "@/src/lib/parking-detector";
import { motionActivityAt, type MotionFix } from "@/src/lib/parking-logic";
import {
  resetTripDetection,
  setMotionGates,
  useTrips,
  type Trip,
} from "@/src/store/trips";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Simula un día laborable completo con la misma lógica que corre en la app:
// grabador de rutas, detector de aparcamiento, puntos de segundo plano y
// sensor de actividad. La app pasa a primer plano y a segundo plano como la
// usaría una persona, y Android llega a matar el servicio de fondo.

type LatLng = [number, number];
type Mode = "fg" | "bg" | "dead";

const HOME: LatLng = [18.468415, -69.811684];
const HOME_CAR: LatLng = [18.46865, -69.8116]; // en la calle, ~30 m
const WORK_CAR: LatLng = [18.4861, -69.9312];
const WORK_DESK: LatLng = [18.4872, -69.9303]; // ~150 m andando
const LUNCH: LatLng = [18.4795, -69.9203];
const SHOP: LatLng = [18.4801, -69.8044];

const M_LAT = 1 / 111_320;
const mLng = (lat: number) => 1 / (111_320 * Math.cos((lat * Math.PI) / 180));

let seed = 7;
function random() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function lengthOf(path: LatLng[]) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += haversineMeters(
      { latitude: path[i - 1][0], longitude: path[i - 1][1] },
      { latitude: path[i][0], longitude: path[i][1] },
    );
  }
  return total;
}

function pointAt(path: LatLng[], distance: number): LatLng {
  let left = distance;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const span = haversineMeters(
      { latitude: a[0], longitude: a[1] },
      { latitude: b[0], longitude: b[1] },
    );
    if (left <= span || i === path.length - 1) {
      const t = span > 0 ? Math.min(1, left / span) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= span;
  }
  return path[path.length - 1];
}

// Recorrido por calles: una «L» entre dos puntos (no en línea recta).
function streets(from: LatLng, to: LatLng): LatLng[] {
  return [
    from,
    [from[0], (from[1] + to[1]) / 2],
    [to[0], (from[1] + to[1]) / 2],
    to,
  ];
}

// --- Mundo simulado ----------------------------------------------------------

let now = Date.parse("2026-11-02T04:00:00Z"); // 00:00 en Santo Domingo
let mode: Mode = "bg";
let position: LatLng = HOME;
const motion: MotionFix[] = [];
let spot: Spot | null = null;
let seenTripId: string | null = null;
const spotLog: { at: number; spot: Spot | null; why: string }[] = [];
let bgBuffer: BackgroundPoint[] = [];
let lastBgAt = 0;
let lastBgPoint: LatLng | null = null;
let lastEvaluateAt = 0;

function setSpot(next: Spot | null, why: string) {
  spot = next;
  spotLog.push({ at: now, spot: next, why });
}

const detector = new ParkingDetector({
  getSpot: () => spot,
  setSpot: (next) => setSpot(next, "detector"),
  clearSpot: () => setSpot(null, "detector-clear"),
  motionSince: (since) => motion.filter((event) => event.at >= since),
});

function walkingNow(speedKmh: number) {
  // Igual que la pantalla del mapa: coche aparcado a más de 25 m y lento.
  if (!spot) return false;
  return (
    haversineMeters(spot, { latitude: position[0], longitude: position[1] }) >
      25 && speedKmh < 8
  );
}

async function emit(speedKmh: number, accuracy: number) {
  const fix = {
    latitude: position[0],
    longitude: position[1],
    speedKmh,
    accuracy,
    at: now,
  };
  if (mode === "fg") {
    detector.onFix(fix);
    if (now - lastEvaluateAt >= 10_000) {
      detector.evaluate(now);
      lastEvaluateAt = now;
    }
    const walking = walkingNow(speedKmh);
    if (walking) {
      if (useTrips.getState().active) await useTrips.getState().stopTrip();
    } else {
      useTrips.getState().recordPoint({ ...fix });
    }
    return;
  }
  if (mode === "dead") return;
  // Servicio de fondo: cada 15 s si se movió 25 m; el task descarta > 50 m.
  const moved = lastBgPoint
    ? haversineMeters(
        { latitude: lastBgPoint[0], longitude: lastBgPoint[1] },
        { latitude: position[0], longitude: position[1] },
      )
    : Infinity;
  if (now - lastBgAt < 15_000 || moved < 25) return;
  lastBgAt = now;
  lastBgPoint = position;
  if (accuracy > 50) return;
  bgBuffer.push({
    latitude: position[0],
    longitude: position[1],
    speedKmh,
    at: now,
  });
}

async function flushBackground() {
  if (bgBuffer.length) {
    await saveBackgroundBatch(bgBuffer);
    bgBuffer = [];
  }
}

// La app vuelve a primer plano: recoge el fondo y revisa el aparcamiento.
async function openApp() {
  await flushBackground();
  mode = "fg";
  jest.setSystemTime(now);
  await useTrips.getState().ingestBackground();
  const fromTrip = spotFromTripEnd(
    useTrips.getState().trips[0],
    spot,
    seenTripId,
    now,
    motion,
  );
  if (fromTrip.seen) seenTripId = fromTrip.seen;
  if (fromTrip.spot) setSpot(fromTrip.spot, "trip-end");
  const decision = reconcileSpotWithMotion(spot, motion, now);
  if (decision.kind === "move") setSpot(decision.spot, "motion");
  else if (decision.kind === "clear" && !detector.pending)
    setSpot(null, "motion-clear");
}

async function closeApp(next: Mode = "bg") {
  mode = next;
  detector.reset();
}

// Avanza segundo a segundo siguiendo un perfil de velocidad por un camino.
async function travel(
  path: LatLng[],
  profile: [number, number][],
  accuracy = 8,
) {
  const total = lengthOf(path);
  let distance = 0;
  for (const [kmh, seconds] of profile) {
    for (let s = 0; s < seconds; s += 1) {
      now += 1_000;
      jest.setSystemTime(now);
      distance = Math.min(total, distance + kmh / 3.6);
      position = pointAt(path, distance);
      const reported = kmh > 0 ? Math.max(0, kmh + (random() - 0.5) * 2) : 0;
      await emit(reported, accuracy + random() * 4);
    }
  }
  position = path[path.length - 1];
}

// Quieto en un sitio. Dentro de casa el GPS «baila» con velocidad falsa.
async function stay(minutes: number, indoors: boolean) {
  const center = position;
  for (let s = 0; s < minutes * 60; s += 1) {
    now += 1_000;
    jest.setSystemTime(now);
    if (indoors) {
      const jump = random() < 0.15 ? 40 + random() * 220 : random() * 25;
      const angle = random() * Math.PI * 2;
      position = [
        center[0] + Math.sin(angle) * jump * M_LAT,
        center[1] + Math.cos(angle) * jump * mLng(center[0]),
      ];
      const accuracy = jump > 40 ? 80 + random() * 200 : 15 + random() * 30;
      const speed = jump > 40 ? 12 + random() * 10 : random() * 3;
      await emit(speed, accuracy);
    } else {
      position = center;
      await emit(0, 6);
    }
  }
  position = center;
}

function sensor(
  type: MotionFix["type"],
  transition: MotionFix["transition"],
  at = now,
  where?: LatLng,
) {
  motion.push({
    type,
    transition,
    at,
    ...(where
      ? {
          latitude: where[0],
          longitude: where[1],
          accuracy: 12,
          fixAt: at - 5_000,
        }
      : null),
  });
  motion.sort((a, b) => a.at - b.at);
}

// Conducir de un aparcamiento a otro con sus avisos del sensor (llegan con
// unos segundos de retraso, como en el teléfono).
async function drive(
  from: LatLng,
  to: LatLng,
  profile: [number, number][],
  options: { walkTo?: LatLng; walkMode?: Mode } = {},
) {
  // El aviso real lleva la última ubicación del teléfono: junto al coche.
  sensor("vehicle", "enter", now + 40_000, from);
  await travel(streets(from, to), profile);
  sensor("still", "enter", now + 10_000);
  await travel([to], [[0, 20]]);
  sensor("vehicle", "exit", now + 30_000, to);
  sensor("foot", "enter", now + 30_000, to);
  if (options.walkTo) {
    if (options.walkMode && options.walkMode !== mode) {
      if (options.walkMode === "fg") await openApp();
      else await closeApp(options.walkMode);
    }
    await travel(
      [to, options.walkTo],
      [[5, Math.ceil(lengthOf([to, options.walkTo]) / (5 / 3.6))]],
    );
  }
}

// Perfil «velocidad de crucero» que cubre una distancia dada.
function cruise(meters: number, kmh: number): [number, number][] {
  return [
    [20, 10],
    [kmh, Math.ceil((meters - 60) / (kmh / 3.6))],
    [15, 5],
  ];
}

function realTrips(): Trip[] {
  return useTrips.getState().trips.filter((trip) => !trip.test);
}

function near(point: Spot | null, target: LatLng, meters: number) {
  if (!point) return false;
  return (
    haversineMeters(point, { latitude: target[0], longitude: target[1] }) <=
    meters
  );
}

// --- El día --------------------------------------------------------------------

describe("un día completo de uso", () => {
  const checkpoints: Record<
    string,
    { trips: number; spot: Spot | null; active: boolean }
  > = {};
  const mark = (name: string) => {
    checkpoints[name] = {
      trips: realTrips().length,
      spot,
      active: Boolean(useTrips.getState().active),
    };
  };

  beforeAll(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    await AsyncStorage.clear();
    resetTripDetection();
    useTrips.setState({
      active: null,
      trips: [],
      totals: { drives: 0, distanceM: 0, durationMs: 0 },
      hydrated: true,
    });
    // Mismas reglas que useTripRecorder con el sensor real.
    setMotionGates({
      blocksStart: (at) => {
        const state = motionActivityAt(motion, at);
        return state === "still" || state === "foot";
      },
      hadVehicle: (from, to) => {
        if (!motion.some((event) => event.at < from)) return null;
        if (motionActivityAt(motion, from) === "vehicle") return true;
        return motion.some(
          (event) =>
            event.type === "vehicle" &&
            event.transition === "enter" &&
            event.at >= from &&
            event.at <= to,
        );
      },
    });
    setSpot(
      { latitude: HOME_CAR[0], longitude: HOME_CAR[1], at: now - 3_600_000 },
      "ayer",
    );
    sensor("still", "enter", now - 3_000_000);

    // 00:00-07:20 durmiendo; el servicio de fondo recibe el GPS de interior.
    position = HOME;
    await stay(60, true);
    now += 6 * 3_600_000;
    await stay(20, true);

    // 07:20 abre la app en casa un rato (GPS de interior en primer plano).
    await openApp();
    await stay(8, true);
    mark("mañana en casa");

    // 07:30 sale andando al coche y va al trabajo con la app abierta,
    // navegando. Atasco de 6 min a mitad.
    await travel([HOME, HOME_CAR], [[4, 30]]);
    const toWork = streets(HOME_CAR, WORK_CAR);
    const half = lengthOf(toWork) / 2;
    sensor("vehicle", "enter", now + 40_000, HOME_CAR);
    await travel(toWork, [
      ...cruise(half, 45),
      [0, 90],
      [6, 25],
      [0, 120],
      [4, 30],
      [0, 60],
      [8, 20],
      ...cruise(half - 60, 55),
    ]);
    mark("tras el atasco");
    sensor("still", "enter", now + 10_000);
    await travel([WORK_CAR], [[0, 25]]);
    sensor("vehicle", "exit", now + 30_000, WORK_CAR);
    sensor("foot", "enter", now + 30_000, WORK_CAR);
    await travel([WORK_CAR, WORK_DESK], [[5, 110]]);
    await stay(2, true);
    mark("llega al trabajo");
    await closeApp();

    // Mañana en la oficina (segundo plano, GPS de interior).
    await stay(30, true);
    now += 3.5 * 3_600_000;

    // 12:30 almuerzo con la app cerrada: ida y vuelta en coche.
    await travel([WORK_DESK, WORK_CAR], [[5, 110]]);
    await drive(
      WORK_CAR,
      LUNCH,
      cruise(lengthOf(streets(WORK_CAR, LUNCH)), 40),
      {
        walkTo: [LUNCH[0] + 60 * M_LAT, LUNCH[1]],
      },
    );
    await stay(40, true);
    await travel([[LUNCH[0] + 60 * M_LAT, LUNCH[1]], LUNCH], [[5, 45]]);
    await drive(
      LUNCH,
      WORK_CAR,
      cruise(lengthOf(streets(LUNCH, WORK_CAR)), 40),
      {
        walkTo: WORK_DESK,
      },
    );
    await stay(20, true);
    await openApp();
    await stay(2, true);
    mark("tras el almuerzo");
    await closeApp();
    now += 4 * 3_600_000;

    // 17:30 vuelta a casa: abre la app al salir y luego la deja de fondo
    // (WhatsApp); un accidente le tiene 8 min parado.
    await openApp();
    await travel([WORK_DESK, WORK_CAR], [[5, 110]]);
    const home = streets(WORK_CAR, HOME_CAR);
    const third = lengthOf(home) / 3;
    sensor("vehicle", "enter", now + 40_000, WORK_CAR);
    await travel(
      home.slice(0, 2),
      cruise(Math.min(third, lengthOf(home.slice(0, 2))), 50),
    );
    await closeApp();
    await travel(
      [home[1], home[2]],
      [
        ...cruise(lengthOf([home[1], home[2]]) / 2, 60),
        [0, 8 * 60],
        ...cruise(lengthOf([home[1], home[2]]) / 2, 60),
      ],
    );
    await travel([home[2], home[3]], cruise(lengthOf([home[2], home[3]]), 40));
    sensor("still", "enter", now + 10_000);
    await travel([HOME_CAR], [[0, 20]]);
    sensor("vehicle", "exit", now + 30_000, HOME_CAR);
    sensor("foot", "enter", now + 30_000, HOME_CAR);
    await travel([HOME_CAR, HOME], [[4, 30]]);
    await stay(15, true);
    await openApp();
    await stay(3, true);
    mark("vuelve a casa");
    await closeApp();

    // 19:00 recado al súper con la app cerrada. A la vuelta Android ha
    // matado el servicio de fondo: solo queda el sensor.
    await stay(60, true);
    await travel([HOME, HOME_CAR], [[4, 30]]);
    await drive(HOME_CAR, SHOP, cruise(lengthOf(streets(HOME_CAR, SHOP)), 45), {
      walkTo: [SHOP[0], SHOP[1] + 50 * mLng(SHOP[0])],
    });
    await stay(25, false);
    await travel([[SHOP[0], SHOP[1] + 50 * mLng(SHOP[0])], SHOP], [[5, 36]]);
    await closeApp("dead");
    const parkedAgain: LatLng = [HOME_CAR[0] + 40 * M_LAT, HOME_CAR[1]];
    await drive(
      SHOP,
      parkedAgain,
      cruise(lengthOf(streets(SHOP, parkedAgain)), 45),
      {
        walkTo: HOME,
      },
    );
    await stay(60, true);

    // 21:50 abre la app en casa y la deja abierta un rato.
    mode = "bg";
    await openApp();
    await stay(12, true);
    mark("noche en casa");
  }, 120_000);

  afterAll(() => {
    setMotionGates(null);
    jest.useRealTimers();
  });

  it("el GPS de interior nunca abre una ruta", () => {
    expect(checkpoints["mañana en casa"].active).toBe(false);
    expect(checkpoints["mañana en casa"].trips).toBe(0);
    expect(checkpoints["noche en casa"].active).toBe(false);
  });

  it("el atasco no parte la ida al trabajo ni marca aparcamiento", () => {
    expect(checkpoints["tras el atasco"].active).toBe(true);
    const duringJam = spotLog.filter(
      (entry) => entry.why === "detector" && entry.spot,
    );
    const firstWorkPark = duringJam.find((entry) =>
      near(entry.spot, WORK_CAR, 40),
    );
    const wrong = duringJam.filter(
      (entry) =>
        firstWorkPark &&
        entry.at < firstWorkPark.at &&
        !near(entry.spot, HOME_CAR, 40),
    );
    expect(wrong).toEqual([]);
  });

  it("la ida al trabajo se guarda entera con su distancia, tiempo y velocidades", () => {
    // La primera ruta del día (la del recado también sale de casa).
    const commute = realTrips()[realTrips().length - 1];
    expect(commute).toBeDefined();
    const expected = lengthOf(streets(HOME_CAR, WORK_CAR));
    expect(commute!.distanceM).toBeGreaterThan(expected * 0.9);
    expect(commute!.distanceM).toBeLessThan(expected * 1.1);
    expect(commute!.maxSpeedKmh).toBeGreaterThan(50);
    expect(commute!.maxSpeedKmh).toBeLessThan(60);
    const minutes = ((commute!.endedAt ?? 0) - commute!.startedAt) / 60_000;
    expect(minutes).toBeGreaterThan(15);
    expect(minutes).toBeLessThan(40);
  });

  it("al llegar al trabajo el coche queda aparcado donde se dejó", () => {
    expect(near(checkpoints["llega al trabajo"].spot, WORK_CAR, 30)).toBe(true);
  });

  it("el almuerzo con la app cerrada se graba y el coche vuelve al trabajo", () => {
    expect(checkpoints["tras el almuerzo"].trips).toBe(3);
    expect(near(checkpoints["tras el almuerzo"].spot, WORK_CAR, 30)).toBe(true);
  });

  it("la vuelta a casa (mitad de fondo, accidente de 8 min) es un solo viaje", () => {
    expect(checkpoints["vuelve a casa"].trips).toBe(4);
    expect(near(checkpoints["vuelve a casa"].spot, HOME_CAR, 30)).toBe(true);
  });

  it("con el servicio de fondo muerto, el sensor deja el coche donde se aparcó", () => {
    const final = checkpoints["noche en casa"];
    expect(near(final.spot, [HOME_CAR[0] + 40 * M_LAT, HOME_CAR[1]], 30)).toBe(
      true,
    );
  });

  it("no hay rutas fantasma: todas salen de un aparcamiento y recorren > 1 km", () => {
    const trips = realTrips();
    expect(trips.length).toBe(5);
    for (const trip of trips) expect(trip.distanceM).toBeGreaterThan(1_000);
  });
});
