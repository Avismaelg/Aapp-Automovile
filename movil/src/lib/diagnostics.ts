import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { getMotionEvents } from '@/modules/motion';
import { readErrorLog } from '@/src/lib/error-log';
import { useParking } from '@/src/store/parking';
import { useTrips } from '@/src/store/trips';

// Diagnóstico de un día para revisar rutas, aparcamientos y errores con
// datos reales (la app de producción no deja leer sus datos por USB). Solo
// sale del teléfono si el usuario lo comparte.

export const DIAGNOSTIC_DAYS = 1;

export function startOfDay(now: number) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export async function buildDiagnostic(now = Date.now()) {
  const since = startOfDay(now) - (DIAGNOSTIC_DAYS - 1) * 86_400_000;
  const { trips, active } = useTrips.getState();
  const dayTrips = [...trips, ...(active ? [active] : [])].filter(
    (trip) => (trip.endedAt ?? now) >= since,
  );
  return {
    version: 1,
    createdAt: new Date(now).toISOString(),
    since: new Date(since).toISOString(),
    platform: Platform.OS,
    parking: useParking.getState().spot,
    trips: dayTrips.map((trip) => ({
      id: trip.id,
      test: Boolean(trip.test),
      startedAt: trip.startedAt,
      endedAt: trip.endedAt,
      distanceM: Math.round(trip.distanceM),
      points: trip.points.map((point) => [
        Math.round(point.latitude * 1e6) / 1e6,
        Math.round(point.longitude * 1e6) / 1e6,
        point.speedKmh != null ? Math.round(point.speedKmh) : null,
        point.at,
      ]),
    })),
    activeTripId: active?.id ?? null,
    motion: getMotionEvents(since),
    errors: (await readErrorLog()).filter((entry) => Date.parse(entry.at) >= since),
  };
}

export async function shareDiagnostic() {
  const data = JSON.stringify(await buildDiagnostic());
  const name = `caravana-diagnostico-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(data);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: name });
    return;
  }
  await Share.share({ message: data });
}
