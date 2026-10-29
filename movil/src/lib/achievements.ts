import type { Ionicons } from '@expo/vector-icons';

import { formatNumber } from '@/src/lib/format';
import type { Trip } from '@/src/store/trips';

export type Achievement = {
  id: string;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const DAY_MS = 24 * 3_600_000;

// Logros calculados con los viajes grabados en el dispositivo. Nunca premian
// la velocidad: solo distancia y constancia.
export function tripAchievements(trips: Trip[], now = Date.now()): Achievement[] {
  const finished = trips.filter((trip) => trip.endedAt != null);
  if (finished.length === 0) return [];

  const totalKm = finished.reduce((sum, trip) => sum + trip.distanceM, 0) / 1000;
  const longest = finished.reduce((best, trip) => (trip.distanceM > best.distanceM ? trip : best));
  const activeDays = new Set(
    finished
      .filter((trip) => now - trip.startedAt <= 30 * DAY_MS)
      .map((trip) => new Date(trip.startedAt).toDateString()),
  ).size;

  const list: Achievement[] = [
    {
      id: 'distance',
      title: `${formatNumber(totalKm, 0)} km grabados`,
      detail: `${finished.length} ${finished.length === 1 ? 'viaje' : 'viajes'} en tu historial`,
      icon: 'map',
    },
    {
      id: 'longest',
      title: 'Viaje más largo',
      detail: `${formatNumber(longest.distanceM / 1000, 1)} km`,
      icon: 'navigate',
    },
  ];
  if (activeDays > 0) {
    list.push({
      id: 'streak',
      title: 'En ruta',
      detail: `${activeDays} ${activeDays === 1 ? 'día' : 'días'} con viajes en el último mes`,
      icon: 'calendar',
    });
  }
  return list;
}

// Totales de los viajes guardados en el dispositivo (los últimos 30).
export function tripStats(trips: Trip[]) {
  const finished = trips.filter((trip) => trip.endedAt != null);
  const km = finished.reduce((sum, trip) => sum + trip.distanceM, 0) / 1000;
  const ms = finished.reduce((sum, trip) => sum + ((trip.endedAt ?? trip.startedAt) - trip.startedAt), 0);
  return { drives: finished.length, km, hours: Math.round(ms / 3_600_000) };
}
