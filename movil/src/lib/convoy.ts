// Reglas del convoy en tiempo real y de los retos por llegada. Sin React ni
// Supabase: las usan los hooks, el simulador y las pruebas.

export type Point = { latitude: number; longitude: number };

export function metersBetween(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

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
  if (member.isMe) return 'TÚ';
  if (!member.lastSeenAt) return 'SIN SEÑAL';
  const age = now - Date.parse(member.lastSeenAt);
  if (!Number.isFinite(age) || age > MEMBER_STALE_MS) {
    const minutes = Math.max(1, Math.round(age / 60_000));
    return minutes > 59 ? 'SIN SEÑAL' : `HACE ${minutes} MIN`;
  }
  if (member.speedKmh != null && member.speedKmh >= 5) return `${Math.round(member.speedKmh)} KM/H`;
  return 'PARADO';
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

// ---------------------------------------------------------------------------
// Retos por llegada
// ---------------------------------------------------------------------------

export const ARRIVE_RADIUS_M = 60;

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

// Cada cuánto informar del avance: cada 5 s, o al momento si llegas.
export function shouldReportProgress(
  last: { pct: number; at: number } | null,
  next: { pct: number; at: number; arrived: boolean },
) {
  if (next.arrived) return true;
  if (!last) return true;
  return next.at - last.at >= 5_000 && next.pct - last.pct >= 0.5;
}

export function placeLabel(rank: number) {
  return rank === 1 ? '¡Has ganado!' : `Has llegado ${rank}º`;
}
