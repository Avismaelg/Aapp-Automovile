// Cola de eventos locales pendientes de subir. Se lee la lista viva en cada
// vuelta porque markSynced la cambia mientras se sube; así el efecto de React
// no se reinicia a media subida ni sube dos veces el siguiente evento.
//
// Un evento que el servidor rechaza (por ejemplo, una política RLS) no bloquea
// a los demás: se deja pendiente y se sigue con el siguiente. Un fallo de red
// (sin código) sí corta la cola hasta el próximo cambio local.
export type PendingEventLike = {
  id: string;
  pendingSync?: boolean;
};

export type EventInsertResult = {
  error: { code?: string | null } | null;
};

export async function syncPendingEvents<T extends PendingEventLike>({
  getEvents,
  insert,
  markSynced,
  isSameAccount,
}: {
  getEvents: () => T[];
  insert: (event: T) => Promise<EventInsertResult>;
  markSynced: (id: string) => void;
  isSameAccount: () => boolean;
}): Promise<boolean> {
  const rejected = new Set<string>();
  for (;;) {
    const event = getEvents().find((item) => item.pendingSync && !rejected.has(item.id));
    if (!event) return true;

    const { error } = await insert(event);
    // Cambió la cuenta a media subida: lo que queda no es suyo.
    if (!isSameAccount()) return false;
    // 23505: ya estaba en el servidor (se subió y no llegó a marcarse).
    if (!error || error.code === '23505') {
      markSynced(event.id);
      continue;
    }
    // Sin código es un fallo de red: se reintenta con el siguiente cambio local.
    if (!error.code) return false;
    rejected.add(event.id);
  }
}
