export type GeoPoint = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Distancia sobre la esfera terrestre; suficiente para rutas de coche. Es la
// única fórmula de distancia de la app: las demás la importan de aquí.
export function haversineMeters(a: GeoPoint, b: GeoPoint) {
  return haversine(a.latitude, a.longitude, b.latitude, b.longitude);
}

// Lo mismo con puntos [lat, lng] (geometrías de ruta), sin crear objetos.
export function haversineTupleMeters(a: readonly [number, number], b: readonly [number, number]) {
  return haversine(a[0], a[1], b[0], b[1]);
}
