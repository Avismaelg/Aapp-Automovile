// Cambios de miembros de la party que llegan por tiempo real (posición,
// silencio, canal de voz). Con parties grandes llegan decenas por segundo:
// se acumulan y se aplican juntos una vez por segundo, en una sola pasada.

export type MemberPatch = {
  user_id: string;
  left_at?: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
  last_seen_at?: string | null;
  last_speed_kmh?: number | string | null;
  last_heading?: number | string | null;
  is_muted?: boolean;
  voice_channel_slug?: string;
};

type PatchableMember = {
  userId: string;
  lastLat: number | null;
  lastLng: number | null;
  lastSeenAt: string | null;
  speedKmh?: number | null;
  heading?: number | null;
  isMuted: boolean;
  voiceChannelSlug: string;
};

// ¿Este cambio altera quién está en la party? Salir se guarda como UPDATE
// con left_at (no es un DELETE): hay que recargar la lista, no parchearla.
export function changesMembership(row: MemberPatch, members: { userId: string }[]) {
  if (row.left_at) return true;
  // Alguien que no estaba (vuelve a unirse reactivando su fila).
  return !members.some((member) => member.userId === row.user_id);
}

// Junta un cambio nuevo con los pendientes del mismo usuario (gana el último
// valor de cada campo).
export function queueMemberPatch(queue: Map<string, MemberPatch>, row: MemberPatch) {
  const previous = queue.get(row.user_id);
  const merged: MemberPatch = { ...previous, user_id: row.user_id };
  for (const key of Object.keys(row) as (keyof MemberPatch)[]) {
    if (row[key] !== undefined) (merged as Record<string, unknown>)[key] = row[key];
  }
  queue.set(row.user_id, merged);
}

// Aplica todos los cambios pendientes. Devuelve la misma lista si ninguno
// corresponde a un miembro (no hay que repintar).
export function applyMemberPatches<T extends PatchableMember>(
  members: T[],
  queue: Map<string, MemberPatch>,
): T[] {
  if (queue.size === 0) return members;
  let changed = false;
  const next = members.map((member) => {
    const row = queue.get(member.userId);
    if (!row) return member;
    changed = true;
    return {
      ...member,
      lastLat: row.last_lat !== undefined ? row.last_lat : member.lastLat,
      lastLng: row.last_lng !== undefined ? row.last_lng : member.lastLng,
      lastSeenAt: row.last_seen_at !== undefined ? row.last_seen_at : member.lastSeenAt,
      speedKmh:
        row.last_speed_kmh !== undefined
          ? row.last_speed_kmh == null ? null : Number(row.last_speed_kmh)
          : member.speedKmh,
      heading:
        row.last_heading !== undefined
          ? row.last_heading == null ? null : Number(row.last_heading)
          : member.heading,
      isMuted: row.is_muted !== undefined ? row.is_muted : member.isMuted,
      voiceChannelSlug:
        row.voice_channel_slug !== undefined ? row.voice_channel_slug : member.voiceChannelSlug,
    };
  });
  return changed ? next : members;
}
