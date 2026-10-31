// Qué cambios de tiempo real recibe cada teléfono. Lo usan useParty (para
// suscribirse en Supabase) y las pruebas de carga (para simular el reparto de
// mensajes entre miles de usuarios con exactamente las mismas reglas).

export type RealtimeTable = 'parties' | 'party_members';

export type RealtimeSubscription = {
  table: RealtimeTable;
  // Filtro de Supabase «columna=eq.valor»; sin filtro llega todo.
  filter?: { column: string; value: string };
};

export function partySubscriptions(
  accountId: string,
  partyId: string | null,
): RealtimeSubscription[] {
  // En una party: solo los cambios de esa party y de sus miembros.
  if (partyId) {
    return [
      { table: 'parties', filter: { column: 'id', value: partyId } },
      { table: 'party_members', filter: { column: 'party_id', value: partyId } },
    ];
  }
  // Sin party: solo tus propias altas (te invitan o te unes desde otro sitio).
  return [{ table: 'party_members', filter: { column: 'user_id', value: accountId } }];
}

export function filterString(subscription: RealtimeSubscription) {
  return subscription.filter
    ? `${subscription.filter.column}=eq.${subscription.filter.value}`
    : undefined;
}

export function matchesSubscription(
  subscription: RealtimeSubscription,
  table: RealtimeTable,
  row: Record<string, unknown>,
) {
  if (subscription.table !== table) return false;
  if (!subscription.filter) return true;
  return String(row[subscription.filter.column]) === subscription.filter.value;
}
