import type { Point } from '@/src/lib/convoy';

// Punto de salida guardado de un reto. AsyncStorage puede devolver JSON
// corrupto o de otra versión: si no es una coordenada válida se ignora y se
// vuelve a guardar la posición actual, en vez de romper el efecto del reto.
export function parseChallengeStart(raw: string | null): Point | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { latitude?: unknown; longitude?: unknown };
    const { latitude, longitude } = value;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return null;
    }
    if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return null;
    }
    return { latitude, longitude };
  } catch {
    return null;
  }
}
