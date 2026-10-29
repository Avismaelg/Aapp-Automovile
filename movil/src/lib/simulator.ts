import { create } from 'zustand';

import { partyMembers } from '@/src/data/mock';
import { recommendedSpeeds, resampleAhead } from '@/src/lib/driving-line';

// Simulador de pruebas: mueve tu posición por una ruta real (con frenadas en
// las curvas), simula aparcar, caminar y volver al coche, y amigos de una
// party que te siguen en convoy. Las posiciones simuladas nunca se publican
// en Supabase ni se graban como viajes.

type LatLng = [number, number];

export type SimPhase =
  | 'idle'
  | 'waiting-route'
  | 'driving'
  | 'arrived'
  | 'parking'
  | 'walking-away'
  | 'away'
  | 'walking-back'
  | 'driving-off'
  | 'detour';

export type SimFix = {
  latitude: number;
  longitude: number;
  speedKmh: number;
  heading: number;
};

export type SimMember = {
  id: string;
  name: string;
  color: string;
  latitude: number;
  longitude: number;
  isTalking: boolean;
};

type SimState = {
  active: boolean;
  phase: SimPhase;
  label: string;
  fix: SimFix | null;
  cruiseKmh: number;
  party: boolean;
  members: SimMember[];
};

export const useSimulator = create<SimState>(() => ({
  active: false,
  phase: 'idle',
  label: '',
  fix: null,
  cruiseKmh: 50,
  party: false,
  members: [],
}));

export const PHASE_LABELS: Record<SimPhase, string> = {
  idle: 'Parado',
  'waiting-route': 'Calculando ruta…',
  driving: 'Conduciendo',
  arrived: 'Llegada',
  parking: 'Aparcando',
  'walking-away': 'Caminando lejos del coche',
  away: 'Lejos del coche',
  'walking-back': 'Volviendo al coche',
  'driving-off': 'Arrancando',
  detour: 'Saliéndote de la ruta',
};

const TICK_MS = 1_000;
const ACCEL_MS2 = 2.2;
const BRAKE_MS2 = 3;
const WALK_KMH = 5;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

function metersBetween(a: LatLng, b: LatLng) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(a: LatLng, b: LatLng) {
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x =
    Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) -
    Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Punto a `meters` en la dirección `bearing` (grados).
export function offsetPoint(from: LatLng, bearing: number, meters: number): LatLng {
  const d = meters / 6371000;
  const b = toRad(bearing);
  const lat1 = toRad(from[0]);
  const lng1 = toRad(from[1]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 =
    lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lat2), toDeg(lng2)];
}

// Recorrido a lo largo de una polilínea con distancias acumuladas.
class PathWalker {
  private cumulative: number[];
  readonly length: number;

  constructor(private points: LatLng[]) {
    this.cumulative = [0];
    for (let index = 1; index < points.length; index += 1) {
      this.cumulative.push(this.cumulative[index - 1] + metersBetween(points[index - 1], points[index]));
    }
    this.length = this.cumulative[this.cumulative.length - 1] ?? 0;
  }

  at(distance: number): { point: LatLng; heading: number; index: number } {
    const d = Math.max(0, Math.min(this.length, distance));
    let index = 1;
    while (index < this.cumulative.length - 1 && this.cumulative[index] < d) index += 1;
    const a = this.points[index - 1];
    const b = this.points[index] ?? a;
    const span = this.cumulative[index] - this.cumulative[index - 1] || 1;
    const t = (d - this.cumulative[index - 1]) / span;
    return {
      point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      heading: bearingDeg(a, b),
      index: index - 1,
    };
  }

  // Velocidad recomendada (km/h) en los próximos ~120 m.
  safeSpeedAhead(distance: number, cruiseKmh: number) {
    const { index } = this.at(distance);
    const samples = resampleAhead(this.points, index, 160);
    if (samples.length < 3) return cruiseKmh;
    const speeds = recommendedSpeeds(samples, cruiseKmh);
    return Math.min(...speeds.slice(0, 12));
  }
}

// --- Motor ---------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;
let script: (() => void) | null = null;
let trail: LatLng[] = [];
// Prueba de desvío: tras unos metros de ruta se sale por una calle lateral
// para comprobar que la app recalcula.
let detourPending = false;

function setFix(fix: SimFix, phase?: SimPhase) {
  trail.push([fix.latitude, fix.longitude]);
  if (trail.length > 600) trail = trail.slice(-600);
  useSimulator.setState((state) => ({
    fix,
    phase: phase ?? state.phase,
    members: state.party ? convoy(state.members) : [],
  }));
}

function runEvery(step: () => void) {
  if (timer) clearInterval(timer);
  script = step;
  timer = setInterval(() => script?.(), TICK_MS);
}

function currentPoint(): LatLng | null {
  const fix = useSimulator.getState().fix;
  return fix ? [fix.latitude, fix.longitude] : null;
}

// Conduce por la ruta acelerando y frenando antes de las curvas; al final se
// detiene y queda en «llegada».
function drive(points: LatLng[], phase: SimPhase, onDone?: () => void) {
  const walker = new PathWalker(points);
  let distance = 0;
  let speed = 0; // m/s
  runEvery(() => {
    const cruise = useSimulator.getState().cruiseKmh;
    const remaining = walker.length - distance;
    // Para llegar parado: no más rápido de lo que deja frenar en lo que queda.
    const stopLimit = Math.sqrt(2 * BRAKE_MS2 * Math.max(0, remaining)) * 3.6;
    const target = Math.min(cruise, walker.safeSpeedAhead(distance, cruise), stopLimit) / 3.6;
    speed = target > speed ? Math.min(target, speed + ACCEL_MS2) : Math.max(target, speed - BRAKE_MS2);
    distance = Math.min(walker.length, distance + speed);
    const { point, heading } = walker.at(distance);
    const done = walker.length - distance < 1.5;
    setFix(
      { latitude: point[0], longitude: point[1], speedKmh: done ? 0 : speed * 3.6, heading },
      done ? 'arrived' : phase,
    );
    if (done) {
      if (timer) clearInterval(timer);
      timer = null;
      onDone?.();
    }
  });
}

function walk(to: LatLng, phase: SimPhase, onDone: () => void) {
  const from = currentPoint();
  if (!from) return;
  const walker = new PathWalker([from, to]);
  let distance = 0;
  runEvery(() => {
    distance = Math.min(walker.length, distance + WALK_KMH / 3.6);
    const { point, heading } = walker.at(distance);
    const done = walker.length - distance < 0.5;
    setFix({ latitude: point[0], longitude: point[1], speedKmh: done ? 0 : WALK_KMH, heading }, phase);
    if (done) onDone();
  });
}

function wait(seconds: number, phase: SimPhase, onDone: () => void) {
  let left = seconds;
  const fix = useSimulator.getState().fix;
  runEvery(() => {
    if (fix) setFix({ ...fix, speedKmh: 0 }, phase);
    left -= 1;
    if (left <= 0) onDone();
  });
}

// Amigos de la party en convoy: siguen tu rastro con unos segundos de retraso
// y un pequeño desplazamiento lateral.
// Son los mismos amigos de la party de demo, para que la lista y el mapa
// coincidan.
const CONVOY = partyMembers.slice(0, 3).map((member, index) => ({
  id: member.id,
  name: member.name,
  color: member.color,
  delay: 8 * (index + 1),
  side: index % 2 === 0 ? 4 : -4,
}));

function convoy(previous: SimMember[]): SimMember[] {
  return CONVOY.map((member, index) => {
    const position = trail[Math.max(0, trail.length - 1 - member.delay)] ?? trail[0];
    const before = trail[Math.max(0, trail.length - 2 - member.delay)] ?? position;
    const heading = position && before ? bearingDeg(before, position) : 0;
    const [latitude, longitude] = position ? offsetPoint(position, heading + 90, member.side) : [0, 0];
    const talking = previous[index]?.isTalking ?? false;
    return {
      id: member.id,
      name: member.name,
      color: member.color,
      latitude,
      longitude,
      // Alguien habla de vez en cuando para ver el anillo de voz.
      isTalking: Math.random() < 0.15 ? !talking : talking,
    };
  });
}

// --- API ---------------------------------------------------------------

export function startSimulation(origin: { latitude: number; longitude: number }) {
  trail = [[origin.latitude, origin.longitude]];
  useSimulator.setState({
    active: true,
    phase: 'idle',
    label: 'Simulación lista',
    fix: { latitude: origin.latitude, longitude: origin.longitude, speedKmh: 0, heading: 0 },
  });
}

export function setCruiseKmh(kmh: number) {
  useSimulator.setState({ cruiseKmh: kmh });
}

export function setSimParty(enabled: boolean) {
  useSimulator.setState((state) => ({ party: enabled, members: enabled ? convoy(state.members) : [] }));
}

// La pantalla del mapa llama a esto cuando hay una ruta calculada. Solo se
// acepta una ruta que empiece donde estás (tras un desvío, la vieja no vale:
// hay que esperar a la recalculada).
export function driveRoute(points: LatLng[]) {
  if (points.length < 2) return false;
  const fix = useSimulator.getState().fix;
  if (fix && metersBetween([fix.latitude, fix.longitude], points[0]) > 150) return false;
  if (detourPending) {
    detourPending = false;
    const walker = new PathWalker(points);
    const until = Math.min(350, walker.length * 0.4);
    const partial: LatLng[] = [];
    for (let d = 0; d <= until; d += 10) partial.push(walker.at(d).point);
    const { point, heading } = walker.at(until);
    drive(partial, 'driving', () => {
      // Gira 90° y se aleja 250 m de la ruta; luego espera la recalculada.
      drive([point, offsetPoint(point, heading + 90, 250)], 'detour', () => waitForRoute());
    });
    return true;
  }
  useSimulator.setState({ label: 'Ruta al destino' });
  drive(points, 'driving');
  return true;
}

export function waitForRoute() {
  useSimulator.setState({ phase: 'waiting-route', label: 'Ruta al destino' });
}

export function armDetour() {
  detourPending = true;
}

// Aparcar (parado lo justo para que se detecte), alejarse andando 150 m,
// esperar, volver al coche y arrancar 250 m.
export function runParkingScenario() {
  const origin = currentPoint();
  if (!origin) return;
  const fix = useSimulator.getState().fix;
  const heading = fix?.heading ?? 0;
  useSimulator.setState({ label: 'Aparcar, caminar y volver' });
  // Primero llega conduciendo 120 m para que haya «movimiento» previo.
  const arrival = offsetPoint(origin, heading, 120);
  drive([origin, arrival], 'driving', () => {
    wait(14, 'parking', () => {
      const away = offsetPoint(arrival, heading + 90, 150);
      walk(away, 'walking-away', () => {
        wait(10, 'away', () => {
          walk(arrival, 'walking-back', () => {
            wait(4, 'parking', () => {
              drive([arrival, offsetPoint(arrival, heading, 250)], 'driving-off');
            });
          });
        });
      });
    });
  });
}

export function stopSimulation() {
  if (timer) clearInterval(timer);
  timer = null;
  script = null;
  trail = [];
  useSimulator.setState({ active: false, phase: 'idle', label: '', fix: null, party: false, members: [] });
}

export function isSimulating() {
  return useSimulator.getState().active;
}
