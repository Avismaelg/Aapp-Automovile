// Qué hacer con la sesión de GPS del mapa al pasar a segundo plano.
// - none: no hay nadie suscrito o el permiso ya está denegado (no se
//   reintenta solo al volver).
// - stop: hay handles activos y no se navega; se apagan GPS y brújula.
// - keep-gps: navegando el GPS sigue para que la voz siga dando indicaciones
//   con la pantalla bloqueada; la brújula sí se apaga.
// - pause: no hay handles todavía porque la sesión está arrancando. No se corta
//   aquí (podría ser el diálogo de permisos); beginSession la corta sola en
//   cuanto ve que la app pasó a segundo plano sin navegación.
export type BackgroundLocationAction = 'none' | 'stop' | 'keep-gps' | 'pause';

export function backgroundLocationAction({
  subscribers,
  navigating,
  hasHandles,
  denied,
}: {
  subscribers: number;
  navigating: boolean;
  hasHandles: boolean;
  denied: boolean;
}): BackgroundLocationAction {
  if (subscribers === 0) return 'none';
  if (navigating) return hasHandles || !denied ? 'keep-gps' : 'none';
  if (hasHandles) return 'stop';
  return denied ? 'none' : 'pause';
}
