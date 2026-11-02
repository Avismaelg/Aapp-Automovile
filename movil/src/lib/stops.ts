// Paradas en la ruta (gasolinera, recoger a alguien…). Sin React: las usan el
// store, la pantalla del mapa y las pruebas.

import { metersBetween, type Point } from '@/src/lib/convoy';

export const MAX_STOPS = 5;
// A esta distancia de la parada se da por hecha y la ruta sigue a la próxima.
export const STOP_REACHED_M = 50;

// Dónde meter una parada nueva: en el hueco que menos alarga el viaje (en
// línea recta). Así «añadir gasolinera» no te hace ir y volver.
export function bestStopIndex(origin: Point, stops: Point[], destination: Point, stop: Point) {
  const path = [origin, ...stops, destination];
  let best = stops.length;
  let bestExtra = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const extra =
      metersBetween(path[i], stop) + metersBetween(stop, path[i + 1]) - metersBetween(path[i], path[i + 1]);
    if (extra < bestExtra - 1) {
      bestExtra = extra;
      best = i;
    }
  }
  return best;
}

export function insertStop<T extends Point>(
  origin: Point,
  stops: T[],
  destination: Point,
  stop: T,
): T[] {
  if (stops.length >= MAX_STOPS) return stops;
  // La misma parada dos veces no.
  if (stops.some((item) => metersBetween(item, stop) < 30)) return stops;
  const index = bestStopIndex(origin, stops, destination, stop);
  return [...stops.slice(0, index), stop, ...stops.slice(index)];
}

// ¿Has llegado a la próxima parada? Solo cuenta la siguiente en orden.
// `offRoadM`: lo lejos que queda la parada de la calle por la que pasa la
// ruta (una gasolinera con su terreno puede estar a 80 m); si no, nunca se
// daría por hecha y la ruta te haría volver.
export function reachedNextStop(position: Point, stops: Point[], offRoadM = 0) {
  if (stops.length === 0) return false;
  const radius = STOP_REACHED_M + Math.min(150, Math.max(0, offRoadM));
  return metersBetween(position, stops[0]) <= radius;
}
