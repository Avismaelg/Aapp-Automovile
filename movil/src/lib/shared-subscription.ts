// Una sola suscripción aunque varias pantallas usen el mismo hook a la vez
// (la party se usa en Inicio, Party y Amigos). Antes cada una abría su canal
// de tiempo real y cada posición de cada piloto se procesaba tres veces.

const active = new Map<string, { count: number; stop: () => void }>();

export function acquireSubscription(key: string, start: () => () => void) {
  const current = active.get(key);
  if (current) {
    current.count += 1;
  } else {
    active.set(key, { count: 1, stop: start() });
  }
  return () => {
    const entry = active.get(key);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) {
      active.delete(key);
      entry.stop();
    }
  };
}

// Nombre de canal único por apertura. Supabase devuelve el canal existente si
// el nombre coincide; al cambiar de party o de retos, el viejo aún se está
// cerrando (ya «suscrito») y añadirle escuchas tumbaba la pantalla con
// «cannot add postgres_changes callbacks … after subscribe()».
let topicSeq = 0;
export function uniqueTopic(base: string) {
  topicSeq += 1;
  return `${base}-${topicSeq}`;
}

// Solo para las pruebas.
export function activeSubscriptionCount() {
  return active.size;
}
