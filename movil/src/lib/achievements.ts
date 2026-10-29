import type { Ionicons } from '@expo/vector-icons';

import { formatNumber } from '@/src/lib/format';
import type { Trip, TripTotals } from '@/src/store/trips';

export type Achievement = {
  id: string;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const DAY_MS = 24 * 3_600_000;

// Logros calculados con los viajes grabados en el dispositivo. Nunca premian
// la velocidad: solo distancia y constancia. Los totales cubren toda la vida
// del dispositivo; el viaje más largo y la constancia, el historial guardado.
export function tripAchievements(
  trips: Trip[],
  totals: TripTotals,
  now = Date.now(),
): Achievement[] {
  const finished = trips.filter((trip) => trip.endedAt != null);
  if (finished.length === 0 || totals.drives === 0) return [];

  const totalKm = totals.distanceM / 1000;
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
      detail: `${totals.drives} ${totals.drives === 1 ? 'viaje' : 'viajes'} en total`,
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

export function tripStats(totals: TripTotals) {
  return {
    drives: totals.drives,
    km: totals.distanceM / 1000,
    hours: Math.round(totals.durationMs / 3_600_000),
  };
}
