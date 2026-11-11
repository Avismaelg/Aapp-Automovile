import { displaySpeed, formatDistance, speedUnit, t } from "@/src/i18n";
import { haversineMeters as metersBetween } from "@/src/lib/geo";
// Reglas del convoy en tiempo real y de los retos por llegada. Sin React ni
// Supabase: las usan los hooks, el simulador y las pruebas.

export type Point = { latitude: number; longitude: number };

export { metersBetween };

// ---------------------------------------------------------------------------
// Posición en vivo
// ---------------------------------------------------------------------------

// En marcha se sube cada 3 s (si te has movido); parado, cada 30 s para seguir
// «en vivo». Con 5 pilotos son ~100 escrituras por minuto en total.
export const LIVE_MOVING_MS = 3_000;
export const LIVE_IDLE_MS = 30_000;
export const LIVE_MIN_MOVE_M = 8;
// Sin noticias de un piloto en este tiempo: «sin señal».
export const MEMBER_STALE_MS = 90_000;
// Más viejo que esto, su última posición ya no se pinta en el mapa (cerró la
// app o perdió la señal sin salir de la party).
export const MEMBER_HIDE_MS = 30 * 60_000;
// Posiciones con más error que esto no se comparten con la app abierta.
export const LIVE_SHARE_MAX_ACCURACY_M = 100;

// Con noticias en el último minuto y medio: en vivo (si no, en gris).
export function isMemberLive(lastSeenAt: string | null, now: number) {
  if (!lastSeenAt) return false;
  const at = Date.parse(lastSeenAt);
  return Number.isFinite(at) && now - at <= MEMBER_STALE_MS;
}

export function isMemberOnMap(lastSeenAt: string | null, now: number) {
  if (!lastSeenAt) return false;
  const at = Date.parse(lastSeenAt);
  return Number.isFinite(at) && now - at <= MEMBER_HIDE_MS;
}

export type LiveFix = Point & { at: number; speedKmh: number | null; heading: number | null };

export function shouldPushLive(last: LiveFix | null, next: LiveFix) {
  if (!last) return true;
  const elapsed = next.at - last.at;
  if (elapsed >= LIVE_IDLE_MS) return true;
  if (elapsed < LIVE_MOVING_MS) return false;
  return metersBetween(last, next) >= LIVE_MIN_MOVE_M;
}

export function memberLiveLabel(
  member: { lastSeenAt: string | null; speedKmh: number | null; isMe?: boolean },
  now: number,
) {
  if (member.isMe) return t('TÚ');
  if (!member.lastSeenAt) return t('SIN SEÑAL');
  const age = now - Date.parse(member.lastSeenAt);
  if (!Number.isFinite(age) || age > MEMBER_STALE_MS) {
    const minutes = Math.max(1, Math.round(age / 60_000));
    return minutes > 59 ? t('SIN SEÑAL') : t('HACE {0} MIN', minutes);
  }
  if (member.speedKmh != null && member.speedKmh >= 5) return `${displaySpeed(member.speedKmh)} ${speedUnit().toUpperCase()}`;
  return t('PARADO');
}

// Movimiento suave entre dos posiciones recibidas (llegan cada ~3 s): en vez
// de saltar, el punto avanza hasta la nueva posición.
export function interpolatePoint(from: Point, to: Point, t: number): Point {
  const k = Math.max(0, Math.min(1, t));
  // Un salto enorme (reconexión, GPS loco) no se anima: se coloca directo.
  if (metersBetween(from, to) > 2_000) return to;
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * k,
    longitude: from.longitude + (to.longitude - from.longitude) * k,
  };
}

// ---------------------------------------------------------------------------
// Destino compartido
// ---------------------------------------------------------------------------

export type PartyDestination = Point & { label: string; setBy: string | null; setAt: string | null };

const SAME_DESTINATION_M = 150;

export function sameDestination(a: Point | null, b: Point | null) {
  if (!a || !b) return false;
  return metersBetween(a, b) <= SAME_DESTINATION_M;
}

// ¿Ofrecer «Ir con el convoy»? Cuando otro piloto fija (o cambia) el destino
// de la party y tú no vas allí. Compartir el tuyo NO se decide aquí: solo
// ocurre cuando tú empiezas a navegar (si no, dos pilotos con destinos
// distintos se lo pisarían en bucle).
export function shouldOfferConvoyDestination({
  me,
  party,
  mine,
  navigating,
  dismissedAt,
}: {
  me: string;
  party: PartyDestination | null;
  mine: Point | null;
  navigating: boolean;
  dismissedAt: string | null;
}) {
  if (!party || !party.setBy || party.setBy === me) return false;
  if (navigating && sameDestination(mine, party)) return false;
  if (dismissedAt && party.setAt && dismissedAt === party.setAt) return false;
  return true;
}

export function destinationKey(point: Point | null) {
  return point ? `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}` : null;
}

// ¿Compartir tu destino con el convoy? Cada vez que TÚ cambias de destino
// navegando (desde el mapa, el buscador, un reciente o un evento), no solo
// la primera vez. No se comparte si:
// - es el mismo destino que ya tenías (p. ej. la party cambió y tú no),
// - ya es el de la party (lo acabas de seguir: sin bucles),
// - vas a por tu coche (es solo tuyo).
export function shouldShareMyDestination({
  previousKey,
  mine,
  party,
  navigating,
  personal,
}: {
  previousKey: string | null;
  mine: Point | null;
  party: Point | null;
  navigating: boolean;
  personal: boolean;
}) {
  const key = destinationKey(mine);
  if (!navigating || !mine || key === previousKey) return { share: false, key: previousKey };
  if (personal || sameDestination(mine, party)) return { share: false, key };
  return { share: true, key };
}

// Cuando otro piloto cambia el destino del convoy:
// - 'follow': ibas siguiendo el destino del convoy → cambias solo (no hace
//   falta tocar nada conduciendo);
// - 'offer': ibas a tu aire o no navegabas → «Ir con el convoy»;
// - 'none': ya vas allí, lo fijaste tú o lo descartaste.
export function convoyDestinationAction({
  me,
  party,
  mine,
  navigating,
  handledAt,
  followedKey,
}: {
  me: string;
  party: PartyDestination | null;
  mine: Point | null;
  navigating: boolean;
  handledAt: string | null;
  followedKey: string | null;
}): 'follow' | 'offer' | 'none' {
  if (!party || !party.setBy || party.setBy === me) return 'none';
  if (navigating && sameDestination(mine, party)) return 'none';
  if (handledAt && party.setAt && handledAt === party.setAt) return 'none';
  if (navigating && followedKey && destinationKey(mine) === followedKey) return 'follow';
  return 'offer';
}

// ---------------------------------------------------------------------------
// Retos por llegada
// ---------------------------------------------------------------------------

export const ARRIVE_RADIUS_M = 60;

// Distancia que se declara al crear un reto con meta. La ruta calculada solo
// sirve si la meta es tu destino personal; si es la del convoy, se usa la
// línea recta. Nunca se declara menos que la línea recta: el servidor usa ese
// dato para descartar tiempos de llegada imposibles.
export function challengeDistanceM(
  from: Point,
  goal: Point | null,
  routeDistanceM: number | null,
  routeIsForGoal: boolean,
) {
  if (!goal) return 0;
  const direct = metersBetween(from, goal);
  if (direct === 0) return 0;
  if (!routeIsForGoal || routeDistanceM == null || !Number.isFinite(routeDistanceM)) return direct;
  return Math.max(routeDistanceM, direct);
}

// Avance en % desde donde empezaste hasta la meta. Si empezaste más cerca que
// el radio de llegada, ya cuentas como llegado.
export function challengeProgress(start: Point, end: Point, current: Point) {
  const total = metersBetween(start, end);
  const left = metersBetween(current, end);
  const arrived = left <= ARRIVE_RADIUS_M;
  if (arrived) return { pct: 100, arrived, leftM: left };
  if (total <= ARRIVE_RADIUS_M) return { pct: 0, arrived: false, leftM: left };
  const pct = Math.max(0, Math.min(99, (1 - left / total) * 100));
  return { pct: Math.round(pct * 10) / 10, arrived, leftM: left };
}

// Cada cuánto informar del avance: cada 5 s si avanzaste, cada 15 s aunque no
// (en un tapón el % no cambia pero el tiempo de llegada sí), o al momento si
// llegas.
export function shouldReportProgress(
  last: { pct: number; at: number } | null,
  next: { pct: number; at: number; arrived: boolean },
) {
  if (next.arrived) return true;
  if (!last) return true;
  const elapsed = next.at - last.at;
  return (elapsed >= 5_000 && next.pct - last.pct >= 0.5) || elapsed >= 15_000;
}

// RETO-05: segundos que te faltan para llegar. Si navegas hacia la meta vale
// el tiempo de la ruta con tráfico; si no, una estimación: la distancia en
// línea recta × 1,3 (las calles no van rectas) a tu velocidad, nunca menos de
// 25 km/h (parado en un semáforo no te quedas para siempre).
export const ETA_MIN_SPEED_KMH = 25;
export function challengeEtaS(leftM: number, speedKmh: number | null, routeEtaS: number | null) {
  if (routeEtaS != null && Number.isFinite(routeEtaS) && routeEtaS >= 0) return Math.round(routeEtaS);
  const kmh = Math.max(ETA_MIN_SPEED_KMH, speedKmh ?? 0);
  return Math.round((leftM * 1.3) / (kmh / 3.6));
}

// Clasificación de un reto: los que llegaron por su puesto; los que siguen,
// por el tiempo que les falta (si es reciente: ETA_FRESH_MS, como en el
// convoy) y si no, por el avance.
export function compareRacers(
  a: { finishRank: number | null; etaS?: number | null; etaAt?: string | null; progressPct: number },
  b: { finishRank: number | null; etaS?: number | null; etaAt?: string | null; progressPct: number },
  now: number,
) {
  if (a.finishRank && b.finishRank) return a.finishRank - b.finishRank;
  if (a.finishRank) return -1;
  if (b.finishRank) return 1;
  const fresh = (racer: typeof a) =>
    racer.etaS != null && racer.etaAt != null && now - Date.parse(racer.etaAt) <= ETA_FRESH_MS;
  if (fresh(a) && fresh(b)) return (a.etaS as number) - (b.etaS as number);
  if (fresh(a) !== fresh(b)) return fresh(a) ? -1 : 1;
  return b.progressPct - a.progressPct;
}

export function placeLabel(rank: number) {
  return rank === 1 ? t('¡Has ganado!') : t('Has llegado {0}º', rank);
}

// ---------------------------------------------------------------------------
// Seguir a un piloto
// ---------------------------------------------------------------------------

// Cada cuánto mover el destino tras el piloto que sigues: si se alejó más de
// esto del punto al que vas. Menos recalcularía la ruta sin parar.
export const FOLLOW_MOVE_M = 150;
// A esta distancia ya lo has alcanzado.
export const FOLLOW_CAUGHT_M = 80;

// Nuevo destino al seguir a alguien, o null si no hace falta recalcular.
export function followDestination(
  current: (Point & { followId?: string }) | null,
  target: { id: string; position: Point | null },
) {
  if (!target.position) return null;
  if (current?.followId === target.id && metersBetween(current, target.position) < FOLLOW_MOVE_M) {
    return null;
  }
  return target.position;
}

export function followStatus(me: Point, target: Point | null, lastSeenAt: string | null, now: number) {
  if (!target) return t('sin posición');
  if (lastSeenAt && now - Date.parse(lastSeenAt) > MEMBER_STALE_MS) return t('sin señal');
  const meters = metersBetween(me, target);
  if (meters <= FOLLOW_CAUGHT_M) return t('a tu lado');
  return meters < 1000 ? t('a {0} m', Math.round(meters / 10) * 10) : t('a {0}', formatDistance(meters));
}

// ---------------------------------------------------------------------------
// Llegada de cada miembro a la meta común (CONV-04…CONV-06)
// ---------------------------------------------------------------------------

// A menos de esto de la meta se cuenta como llegado.
export const CONVOY_ARRIVE_M = 50;
// La ETA publicada vale este tiempo; más vieja no se muestra.
export const ETA_FRESH_MS = 2 * 60_000;

export type ConvoyProgress = {
  etaS: number | null;
  remainingM: number | null;
  progressAt: string | null;
  arrivedAt: string | null;
};

export function hasFreshEta(member: ConvoyProgress, now: number) {
  if (member.etaS == null || !member.progressAt) return false;
  const at = Date.parse(member.progressAt);
  return Number.isFinite(at) && now - at <= ETA_FRESH_MS;
}

// Etiqueta del panel: «LLEGÓ», «LLEGA EN 7 MIN · 3,2 KM» o el estado en vivo.
export function convoyMemberLabel(
  member: ConvoyProgress & { lastSeenAt: string | null; speedKmh: number | null; isMe?: boolean },
  now: number,
  formatRemaining: (meters: number) => string,
) {
  if (member.arrivedAt) return t('LLEGÓ');
  if (hasFreshEta(member, now)) {
    const minutes = Math.max(1, Math.round((member.etaS as number) / 60));
    const left = member.remainingM != null ? ` · ${formatRemaining(member.remainingM).toUpperCase()}` : '';
    return `${t('LLEGA EN {0} MIN', minutes)}${left}`;
  }
  return memberLiveLabel(member, now);
}

// CONV-05: primero quien ya llegó (por orden de llegada), luego por ETA y al
// final quien no publica ETA (en el orden en que estaba).
export function sortByArrival<T extends ConvoyProgress>(members: T[], now: number): T[] {
  return members
    .map((member, index) => ({ member, index }))
    .sort((a, b) => {
      const arrivedA = a.member.arrivedAt ? Date.parse(a.member.arrivedAt) : null;
      const arrivedB = b.member.arrivedAt ? Date.parse(b.member.arrivedAt) : null;
      if (arrivedA != null || arrivedB != null) {
        if (arrivedA == null) return 1;
        if (arrivedB == null) return -1;
        return arrivedA - arrivedB;
      }
      const etaA = hasFreshEta(a.member, now) ? (a.member.etaS as number) : null;
      const etaB = hasFreshEta(b.member, now) ? (b.member.etaS as number) : null;
      if (etaA != null && etaB != null) return etaA - etaB;
      if (etaA != null) return -1;
      if (etaB != null) return 1;
      return a.index - b.index;
    })
    .map(({ member }) => member);
}

// ¿Has llegado a la meta común? Por la ruta restante o, sin ruta, por la
// distancia en línea recta.
export function reachedConvoyGoal(position: Point, goal: Point | null, remainingRouteM: number | null) {
  if (!goal) return false;
  if (remainingRouteM != null && remainingRouteM <= CONVOY_ARRIVE_M) return true;
  return metersBetween(position, goal) <= CONVOY_ARRIVE_M;
}

// Miembros que acaban de llegar (para avisar una sola vez a cada uno).
export function newArrivals<T extends { userId: string; arrivedAt: string | null; isMe?: boolean }>(
  previous: Map<string, string | null>,
  members: T[],
): T[] {
  return members.filter((member) => member.arrivedAt && !member.isMe && !previous.get(member.userId));
}
