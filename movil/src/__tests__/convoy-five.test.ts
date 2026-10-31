import { describe, expect, it } from '@jest/globals';

import {
  ARRIVE_RADIUS_M,
  challengeProgress,
  interpolatePoint,
  memberLiveLabel,
  metersBetween,
  sameDestination,
  shouldOfferConvoyDestination,
  shouldPushLive,
  shouldReportProgress,
  type LiveFix,
  type PartyDestination,
  type Point,
} from '@/src/lib/convoy';
import { applyMemberPatches, queueMemberPatch, type MemberPatch } from '@/src/lib/party-patch';
import { matchesSubscription, partySubscriptions } from '@/src/lib/realtime-routing';

// Convoy de 5 pilotos durante 20 minutos, segundo a segundo, con las mismas
// reglas que la app y que el servidor (migración 20261031150000_convoy_live):
// - cada uno sale de un sitio distinto y por su ruta;
// - sus posiciones viajan por el tiempo real filtrado por party;
// - uno fija el destino, los demás lo siguen; luego otro lo cambia;
// - el anfitrión reta al convoy a llegar primero: avance y puestos solos;
// - uno bloquea el móvil a mitad (la tarea de fondo sigue subiendo).

const PARTY = 'party-1';
const DEST_A: Point = { latitude: 18.4735, longitude: -69.8857 }; // primera meta
const DEST_B: Point = { latitude: 18.4801, longitude: -69.8702 }; // meta cambiada
const LATENCY_S = 1; // del servidor al teléfono

type Pilot = {
  id: string;
  name: string;
  pos: Point;
  kmh: number; // velocidad de crucero
  stopEvery: number; // semáforo cada N s
  locked: boolean;
  dest: Point | null;
  navigating: boolean;
  dismissedAt: string | null;
  lastPush: LiveFix | null;
  // Lo que este teléfono ve de los demás (tras el tiempo real y el lote de 1 s).
  view: { userId: string; lastLat: number | null; lastLng: number | null; lastSeenAt: string | null; isMuted: boolean; voiceChannelSlug: string; speedKmh?: number | null }[];
  queue: Map<string, MemberPatch>;
  inbox: { at: number; row: MemberPatch }[];
  challengeStart: Point | null;
  lastReport: { pct: number; at: number } | null;
  reported: number[];
  arrivedAt: number | null;
};

const START_POINTS: Point[] = [
  { latitude: 18.4861, longitude: -69.9312 }, // Ismael (anfitrión)
  { latitude: 18.4552, longitude: -69.9420 }, // Laura
  { latitude: 18.5001, longitude: -69.9105 }, // Pedro
  { latitude: 18.4700, longitude: -69.9600 }, // Marta
  { latitude: 18.4920, longitude: -69.9550 }, // Ana
];
const NAMES = ['Ismael', 'Laura', 'Pedro', 'Marta', 'Ana'];
const SPEEDS = [52, 61, 45, 70, 38];

function stepTowards(from: Point, to: Point, meters: number): Point {
  const d = metersBetween(from, to);
  if (d <= meters || d === 0) return to;
  const k = meters / d;
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * k,
    longitude: from.longitude + (to.longitude - from.longitude) * k,
  };
}

function run() {
  const pilots: Pilot[] = NAMES.map((name, i) => ({
    id: `u${i}`,
    name,
    pos: START_POINTS[i],
    kmh: SPEEDS[i],
    stopEvery: 90 + i * 17,
    locked: false,
    dest: null,
    navigating: false,
    dismissedAt: null,
    lastPush: null,
    view: NAMES.map((_, j) => ({
      userId: `u${j}`,
      lastLat: null,
      lastLng: null,
      lastSeenAt: null,
      isMuted: false,
      voiceChannelSlug: 'convoy',
    })),
    queue: new Map(),
    inbox: [],
    challengeStart: null,
    lastReport: null,
    reported: [],
    arrivedAt: null,
  }));

  // Servidor
  let partyDest = null as PartyDestination | null;
  let destWrites = 0;
  let positionWrites = 0;
  let deliveries = 0;
  const outsider = { inbox: 0 }; // alguien de otra party
  const challenge = {
    live: false,
    finished: false,
    end: null as Point | null,
    participants: new Map<string, { status: 'invited' | 'accepted' | 'declined' | 'finished'; pct: number; rank: number | null }>(),
  };
  const rpcReport = (user: string, pct: number, arrived: boolean) => {
    const p = challenge.participants.get(user);
    if (!challenge.live || !p) throw new Error('challenge_not_live');
    if (p.status === 'finished') return p.rank;
    if (p.status !== 'accepted') throw new Error('not_accepted');
    if (arrived) {
      const max = Math.max(0, ...[...challenge.participants.values()].map((x) => x.rank ?? 0));
      p.status = 'finished';
      p.pct = 100;
      p.rank = max + 1;
      if (![...challenge.participants.values()].some((x) => x.status === 'accepted')) {
        challenge.live = false;
        challenge.finished = true;
      }
      return p.rank;
    }
    p.pct = Math.max(p.pct, Math.min(99, pct));
    return null;
  };

  const broadcast = (now: number, row: MemberPatch & { party_id: string }) => {
    for (const pilot of pilots) {
      const subs = partySubscriptions(pilot.id, PARTY);
      if (subs.some((sub) => matchesSubscription(sub, 'party_members', row))) {
        pilot.inbox.push({ at: now + LATENCY_S, row });
        deliveries += 1;
      }
    }
    if (partySubscriptions('fuera', 'otra-party').some((sub) => matchesSubscription(sub, 'party_members', row))) {
      outsider.inbox += 1;
    }
  };

  const setDestination = (user: string, dest: Point, label: string, now: number) => {
    destWrites += 1;
    partyDest = { ...dest, label, setBy: user, setAt: new Date(now * 1000).toISOString() };
  };

  let maxLagM = 0;
  let maxLagS = 0;
  let maxJumpM = 0;
  const offers: Record<string, number> = {};
  const DURATION_S = 20 * 60;

  for (let t = 0; t <= DURATION_S; t += 1) {
    // --- Guion ---
    if (t === 30) {
      // Pedro busca el destino y pulsa Ir: se comparte con el convoy.
      const pedro = pilots[2];
      pedro.dest = DEST_A;
      pedro.navigating = true;
      setDestination(pedro.id, DEST_A, 'Malecón', t);
    }
    if (t === 60) {
      // El anfitrión reta al convoy: llegar primero a la meta del convoy.
      challenge.live = true;
      challenge.end = partyDest;
      challenge.participants.set('u0', { status: 'accepted', pct: 0, rank: null });
      for (const id of ['u1', 'u2', 'u3', 'u4']) challenge.participants.set(id, { status: 'invited', pct: 0, rank: null });
    }
    if (t === 75) {
      // Laura, Pedro y Marta aceptan; Ana rechaza.
      challenge.participants.get('u1')!.status = 'accepted';
      challenge.participants.get('u2')!.status = 'accepted';
      challenge.participants.get('u3')!.status = 'accepted';
      challenge.participants.get('u4')!.status = 'declined';
    }
    if (t === 300) pilots[1].locked = true; // Laura bloquea el móvil
    if (t === 420) {
      // Ana (no corre el reto) cambia el destino del convoy a un café.
      const ana = pilots[4];
      ana.dest = DEST_B;
      ana.navigating = true;
      setDestination(ana.id, DEST_B, 'Café', t);
    }

    for (const pilot of pilots) {
      // --- Destino del convoy ---
      if (
        shouldOfferConvoyDestination({
          me: pilot.id,
          party: partyDest,
          mine: pilot.dest,
          navigating: pilot.navigating,
          dismissedAt: pilot.dismissedAt,
        })
      ) {
        offers[pilot.id] = (offers[pilot.id] ?? 0) + 1;
        // Quien corre el reto ignora el cambio de Ana; el resto lo sigue.
        const racing = challenge.participants.get(pilot.id)?.status === 'accepted';
        if (racing && partyDest!.setBy === 'u4') {
          pilot.dismissedAt = partyDest!.setAt;
        } else {
          pilot.dest = partyDest!;
          pilot.navigating = true;
          pilot.dismissedAt = partyDest!.setAt;
        }
      }

      // --- Conducir (con semáforos) ---
      const stopped = t % pilot.stopEvery < 20 || !pilot.dest || pilot.arrivedAt != null;
      const target = challenge.participants.get(pilot.id)?.status === 'accepted' && challenge.end ? challenge.end : pilot.dest;
      const before = pilot.pos;
      if (target && !stopped) pilot.pos = stepTowards(pilot.pos, target, pilot.kmh / 3.6);
      // Ya en el destino también cuenta como parado.
      const kmh = metersBetween(before, pilot.pos) > 0.5 ? pilot.kmh : 0;

      // --- Subir posición (app abierta o tarea de fondo: mismo ritmo) ---
      const fix: LiveFix = { ...pilot.pos, at: t * 1000, speedKmh: kmh, heading: 0 };
      if (shouldPushLive(pilot.lastPush, fix)) {
        pilot.lastPush = fix;
        positionWrites += 1;
        broadcast(t, {
          party_id: PARTY,
          user_id: pilot.id,
          last_lat: fix.latitude,
          last_lng: fix.longitude,
          last_speed_kmh: kmh,
          last_seen_at: new Date(t * 1000).toISOString(),
        });
      }

      // --- Reto ---
      const me = challenge.participants.get(pilot.id);
      if (challenge.live && me?.status === 'accepted' && challenge.end) {
        pilot.challengeStart ??= pilot.pos;
        const progress = challengeProgress(pilot.challengeStart, challenge.end, pilot.pos);
        if (shouldReportProgress(pilot.lastReport, { pct: progress.pct, at: t * 1000, arrived: progress.arrived })) {
          pilot.lastReport = { pct: progress.pct, at: t * 1000 };
          pilot.reported.push(progress.pct);
          rpcReport(pilot.id, progress.pct, progress.arrived);
          if (progress.arrived) pilot.arrivedAt = t;
        }
      }

      // --- Recibir: tiempo real + lote de 1 s ---
      const due = pilot.inbox.filter((item) => item.at <= t);
      pilot.inbox = pilot.inbox.filter((item) => item.at > t);
      for (const item of due) queueMemberPatch(pilot.queue, item.row);
      pilot.view = applyMemberPatches(pilot.view, pilot.queue);
      pilot.queue.clear();
    }

    // --- ¿Qué tan al día ve cada uno a los demás? ---
    if (t > 10) {
      for (const viewer of pilots) {
        for (const other of pilots) {
          if (other.id === viewer.id) continue;
          const seen = viewer.view.find((member) => member.userId === other.id)!;
          if (seen.lastLat == null) continue;
          const lag = metersBetween({ latitude: seen.lastLat, longitude: seen.lastLng! }, other.pos);
          maxLagM = Math.max(maxLagM, lag);
          // Cuántos segundos «por detrás» va el punto que ves, a su velocidad.
          const speed = (other.lastPush?.speedKmh ?? 0) / 3.6;
          if (speed > 0) maxLagS = Math.max(maxLagS, Math.round((lag / speed) * 10) / 10);
        }
      }
    }
  }

  // Animación entre dos posiciones recibidas: pasos pequeños, sin saltos.
  for (const pilot of pilots) {
    const from = START_POINTS[pilots.indexOf(pilot)];
    const to = stepTowards(from, DEST_A, 60);
    let prev = from;
    for (let f = 1; f <= 15; f += 1) {
      const p = interpolatePoint(from, to, f / 15);
      maxJumpM = Math.max(maxJumpM, metersBetween(prev, p));
      prev = p;
    }
  }

  return {
    pilots,
    challenge,
    partyDest,
    destWrites,
    positionWrites,
    deliveries,
    outsider,
    maxLagM,
    maxLagS,
    maxJumpM,
    offers,
    minutes: DURATION_S / 60,
  };
}

describe('convoy de 5 pilotos con retos', () => {
  const result = run();

  it('cada uno ve a los otros 4 casi en directo (≤ 5 s de retraso)', () => {
    expect(result.maxLagS).toBeLessThanOrEqual(5);
    // A 70 km/h, 5 s son ~100 m.
    expect(result.maxLagM).toBeLessThan(110);
    console.log(
      `Retraso máximo ${result.maxLagS} s / ${Math.round(result.maxLagM)} m · ` +
        `${Math.round(result.positionWrites / result.minutes)} escrituras/min en total · ` +
        `${Math.round(result.deliveries / result.minutes / 5)} mensajes/min por teléfono`,
    );
  });

  it('también se ve a quien bloqueó el móvil (tarea de fondo)', () => {
    const laura = result.pilots[1];
    const seenByIsmael = result.pilots[0].view.find((m) => m.userId === laura.id)!;
    expect(metersBetween({ latitude: seenByIsmael.lastLat!, longitude: seenByIsmael.lastLng! }, laura.pos)).toBeLessThan(110);
  });

  it('nadie de otra party recibe vuestras posiciones', () => {
    expect(result.outsider.inbox).toBe(0);
  });

  it('el destino se comparte: todos acaban yendo al mismo sitio y sin pisarse', () => {
    // Pedro lo fijó y Ana lo cambió: solo 2 escrituras, sin bucles.
    expect(result.destWrites).toBe(2);
    expect(result.partyDest?.label).toBe('Café');
    // Los que no corrían el reto siguen el cambio de Ana.
    expect(sameDestination(result.pilots[4].dest, DEST_B)).toBe(true);
    // A cada piloto se le ofreció cada cambio una sola vez.
    for (const count of Object.values(result.offers)) expect(count).toBeLessThanOrEqual(2);
  });

  it('el reto se resuelve solo: puestos por orden de llegada y se cierra', () => {
    const racers = result.pilots.filter((p) => ['u0', 'u1', 'u2', 'u3'].includes(p.id));
    for (const racer of racers) {
      expect(racer.arrivedAt).not.toBeNull();
      expect(metersBetween(racer.pos, DEST_A)).toBeLessThanOrEqual(ARRIVE_RADIUS_M + 1);
    }
    const byArrival = [...racers].sort((a, b) => a.arrivedAt! - b.arrivedAt!).map((p) => p.id);
    const byRank = [...result.challenge.participants.entries()]
      .filter(([, p]) => p.rank != null)
      .sort((a, b) => a[1].rank! - b[1].rank!)
      .map(([id]) => id);
    expect(byRank).toEqual(byArrival);
    expect(result.challenge.finished).toBe(true);
    // Ana rechazó: no entra en la clasificación.
    expect(result.challenge.participants.get('u4')!.rank).toBeNull();
    console.log(
      'Llegadas: ' +
        byArrival
          .map((id, i) => `${i + 1}º ${result.pilots.find((p) => p.id === id)!.name} (${result.pilots.find((p) => p.id === id)!.arrivedAt} s)`)
          .join(', '),
    );
  });

  it('el avance de cada piloto solo sube y llega a 100 al cruzar la meta', () => {
    for (const racer of result.pilots.slice(0, 4)) {
      const sent = racer.reported;
      expect(sent.length).toBeGreaterThan(3);
      expect(sent[sent.length - 1]).toBe(100);
      expect(result.challenge.participants.get(racer.id)!.pct).toBe(100);
    }
  });

  it('los puntos se deslizan sin saltos entre posiciones', () => {
    expect(result.maxJumpM).toBeLessThan(10);
  });

  it('etiquetas de estado de cada piloto', () => {
    const now = Date.parse('2026-10-31T15:00:00Z');
    expect(memberLiveLabel({ lastSeenAt: new Date(now - 4_000).toISOString(), speedKmh: 63.4 }, now)).toBe('63 KM/H');
    expect(memberLiveLabel({ lastSeenAt: new Date(now - 4_000).toISOString(), speedKmh: 0 }, now)).toBe('PARADO');
    expect(memberLiveLabel({ lastSeenAt: new Date(now - 5 * 60_000).toISOString(), speedKmh: 50 }, now)).toBe('HACE 5 MIN');
    expect(memberLiveLabel({ lastSeenAt: null, speedKmh: null }, now)).toBe('SIN SEÑAL');
  });
});
