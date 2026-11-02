// Reglas de las invitaciones a la party y de los amigos en el mapa. Sin
// dependencias de React ni de Supabase: las usan los hooks y las pruebas.

import { partyUrl } from '@/src/lib/qr';
import { t } from '@/src/i18n';

// Las invitaciones caducan con la party (24 h); más viejas no se muestran.
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
// RNF-05: miembros por party. 5 en el plan gratuito (el del MVP); 10 es el
// máximo que admite la base de datos.
export const PARTY_FREE_MEMBERS = 5;
export const PARTY_MAX_MEMBERS = 10;
// Tiempo para responder una invitación en pantalla; luego desaparece.
export const INVITE_ANSWER_MS = 15_000;
// Al abrir la app solo se recuperan invitaciones recién llegadas: una de hace
// rato ya caducó aunque nadie la respondiera.
export const INVITE_FRESH_MS = 2 * 60 * 1000;
// Un amigo que no comparte posición desde hace más de esto desaparece del mapa.
export const FRIEND_LOCATION_TTL_MS = 12 * 60 * 60 * 1000;
// Por debajo de esto se considera «en vivo».
export const FRIEND_LIVE_MS = 2 * 60 * 1000;

export type InviteState = 'member' | 'invited' | 'invite';

export type SentInvite = { inviteeId: string; status: 'pending' | 'accepted' | 'declined' };

// Qué botón ve cada amigo en la lista de invitar.
export function inviteStateFor(
  friendId: string,
  memberIds: readonly string[],
  sent: readonly SentInvite[],
): InviteState {
  if (memberIds.includes(friendId)) return 'member';
  if (sent.some((invite) => invite.inviteeId === friendId && invite.status === 'pending')) {
    return 'invited';
  }
  return 'invite';
}

// Primero quien aún no está; los que ya están, al final.
export function sortInviteCandidates<T extends { id: string; name: string }>(
  friends: readonly T[],
  memberIds: readonly string[],
  sent: readonly SentInvite[],
): (T & { state: InviteState })[] {
  const order: Record<InviteState, number> = { invite: 0, invited: 1, member: 2 };
  return friends
    .map((friend) => ({ ...friend, state: inviteStateFor(friend.id, memberIds, sent) }))
    .sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
}

export const PARTY_CODE_LENGTH = 6;

// Saca el código de lo que pegue o escanee el usuario: el código suelto, el
// enlace de invitación (…/p/ABC123 o …/p/?c=ABC123) o el mensaje completo de
// WhatsApp («Código: ABC123»).
export function extractPartyCode(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const fromQuery = text.match(/[?&]c=([A-Za-z0-9]{4,8})\b/);
  if (fromQuery) return fromQuery[1].toUpperCase();
  const fromPath = text.match(/\/p\/([A-Za-z0-9]{4,8})\b/);
  if (fromPath) return fromPath[1].toUpperCase();
  const fromLabel = text.match(/c[óo]digo\s*:?\s*([A-Za-z0-9]{4,8})\b/i);
  if (fromLabel) return fromLabel[1].toUpperCase();
  const bare = text.match(/^[A-Za-z0-9]{4,8}$/);
  return bare ? text.toUpperCase() : null;
}

// Mensaje para WhatsApp: el código va en claro para que funcione aunque el
// enlace no abra la app (por ejemplo, si aún no la tiene instalada).
export function inviteMessage(partyName: string, code: string) {
  return [
    t('Únete a mi convoy «{0}» en Caravana.', partyName),
    t('Código: {0}', code.toUpperCase()),
    t('Ábrelo aquí: {0}', partyUrl(code)),
    t('O en la app: Party › Unirme con código.'),
  ].join('\n');
}

export function defaultPartyName(displayName: string) {
  const first = displayName.trim().split(/\s+/)[0];
  return first ? t('Convoy de {0}', first) : t('Mi convoy');
}

export type FriendLocationRow = {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
};

export type PositionedFriend = {
  latitude: number;
  longitude: number;
  updatedAt: number;
};

// Une las dos fuentes de posición de los amigos (la que comparten con amigos
// y la de la party en común) y se queda con la más reciente de cada uno.
export function latestFriendPositions(
  sources: readonly { userId: string; lat: number | null; lng: number | null; at: string | null }[],
  now: number,
  ttlMs = FRIEND_LOCATION_TTL_MS,
): Map<string, PositionedFriend> {
  const latest = new Map<string, PositionedFriend>();
  for (const row of sources) {
    if (row.lat == null || row.lng == null || !row.at) continue;
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || now - at > ttlMs) continue;
    const previous = latest.get(row.userId);
    if (previous && previous.updatedAt >= at) continue;
    latest.set(row.userId, { latitude: row.lat, longitude: row.lng, updatedAt: at });
  }
  return latest;
}

export function lastSeenLabel(updatedAt: number | undefined, now: number) {
  if (updatedAt == null) return t('En el mapa');
  const ago = now - updatedAt;
  if (ago < FRIEND_LIVE_MS) return t('En vivo');
  const minutes = Math.round(ago / 60_000);
  if (minutes < 60) return t('Hace {0} min', minutes);
  const hours = Math.round(minutes / 60);
  return t('Hace {0} h', hours);
}

// Cuándo volver a subir tu posición para tus amigos: cada 15 s si te mueves
// (más de 25 m) y al menos cada 2 min aunque estés quieto (para seguir
// apareciendo «en vivo»).
export function shouldPushFriendLocation(
  last: { lat: number; lng: number; at: number } | null,
  next: { lat: number; lng: number; at: number },
) {
  if (!last) return true;
  const elapsed = next.at - last.at;
  if (elapsed >= 2 * 60_000) return true;
  if (elapsed < 15_000) return false;
  const meters = Math.hypot(
    (next.lat - last.lat) * 111_320,
    (next.lng - last.lng) * 111_320 * Math.cos((next.lat * Math.PI) / 180),
  );
  return meters > 25;
}

// Errores del servidor → mensajes para el usuario.
export function inviteErrorMessage(message: string) {
  if (message.includes('not_friends')) return t('Solo puedes invitar a tus amigos.');
  if (message.includes('already_member')) return t('Ya está en tu party.');
  if (message.includes('party_full')) return t('La party está llena.');
  if (message.includes('invite_not_found')) return t('Esta invitación ya no es válida.');
  if (message.includes('party_not_found')) return t('Esa party ya terminó.');
  if (message.includes('not_a_member')) return t('Ya no estás en esa party.');
  if (/function .* does not exist|PGRST202|Could not find the function/i.test(message)) {
    return t('El servidor aún no tiene las invitaciones. Hay que actualizar Supabase.');
  }
  return t('No pudimos completar la invitación. Inténtalo de nuevo.');
}
