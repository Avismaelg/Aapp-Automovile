export type RouteCoordinate = [number, number];

// Simplifica la ruta sin cortar las curvas. Si no es posible reducirla con un
// error visual de 12 m como máximo, se conserva completa por seguridad.
const MAX_RENDER_POINTS = 900;

function simplify(points: RouteCoordinate[], toleranceM: number): RouteCoordinate[] {
  const latitude = (points[0][0] * Math.PI) / 180;
  const longitudeScale = 111_320 * Math.cos(latitude);
  const latitudeScale = 111_320;
  const x = points.map((point) => point[1] * longitudeScale);
  const y = points.map((point) => point[0] * latitudeScale);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    const deltaX = x[end] - x[start];
    const deltaY = y[end] - y[start];
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    let maxErrorSquared = 0;
    let maxIndex = -1;

    for (let index = start + 1; index < end; index += 1) {
      const t = lengthSquared > 0
        ? Math.max(0, Math.min(1, ((x[index] - x[start]) * deltaX + (y[index] - y[start]) * deltaY) / lengthSquared))
        : 0;
      const errorX = x[index] - x[start] - t * deltaX;
      const errorY = y[index] - y[start] - t * deltaY;
      const errorSquared = errorX * errorX + errorY * errorY;
      if (errorSquared > maxErrorSquared) {
        maxErrorSquared = errorSquared;
        maxIndex = index;
      }
    }

    if (maxIndex !== -1 && maxErrorSquared > toleranceM * toleranceM) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}

export function compactRouteCoordinates(points: RouteCoordinate[]): RouteCoordinate[] {
  if (points.length <= MAX_RENDER_POINTS) return points;
  for (const toleranceM of [3, 6, 12]) {
    const result = simplify(points, toleranceM);
    if (result.length <= MAX_RENDER_POINTS) return result;
  }
  return points;
}

// Cambio a una ruta más rápida durante la navegación (como Waze): solo si
// ahorra al menos 2 min y un 8 % del tiempo que queda, para no cambiar por
// diferencias de segundos.
export const FASTER_ROUTE_MIN_SAVING_S = 120;
export const FASTER_ROUTE_MIN_SAVING_RATIO = 0.08;

export function fasterRouteSaving(currentRemainingS: number, candidateS: number): number | null {
  if (!Number.isFinite(currentRemainingS) || !Number.isFinite(candidateS) || candidateS <= 0) return null;
  const saving = currentRemainingS - candidateS;
  if (saving < FASTER_ROUTE_MIN_SAVING_S) return null;
  if (saving < currentRemainingS * FASTER_ROUTE_MIN_SAVING_RATIO) return null;
  return saving;
}
