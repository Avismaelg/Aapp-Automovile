// Cuándo se da por llegado al destino de la navegación (como Waze). Antes
// solo a menos de 40 m del punto exacto: aparcando a 60–100 m (un parqueo, el
// otro lado de la calle) nunca avisaba «Has llegado» (tableta, 2026-11-04).

export const ARRIVE_NEAR_M = 50;
export const ARRIVE_END_OF_ROUTE_M = 30;
// Parado cerca: aparcaste.
export const ARRIVE_STOPPED_NEAR_M = 150;
export const ARRIVE_STOPPED_MS = 8_000;
export const STOPPED_KMH = 5;

export function arrivedAtDestination({
  distanceM,
  remainingRouteM,
  offRouteM,
  stopped,
}: {
  distanceM: number | null;
  remainingRouteM: number | null;
  offRouteM: number | null;
  stopped: boolean;
}) {
  if (distanceM != null && distanceM < ARRIVE_NEAR_M) return true;
  const onRoute = (offRouteM ?? Infinity) < 50;
  if (remainingRouteM != null && remainingRouteM < ARRIVE_END_OF_ROUTE_M && onRoute) return true;
  if (!stopped) return false;
  if (distanceM != null && distanceM < ARRIVE_STOPPED_NEAR_M) return true;
  return remainingRouteM != null && remainingRouteM < 100 && (offRouteM ?? Infinity) < 60;
}
