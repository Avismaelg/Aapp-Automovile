import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationObject } from 'expo-location';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export type PendingPoint = {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  at: number;
};

export const BACKGROUND_LOCATION_TASK = 'caravana-background-location';
const QUEUE_KEY = 'caravana.pending.points.v1';
const MAX_QUEUE = 2000;

// En web no hay servicio de ubicación en segundo plano nativo.
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const locations = (data as { locations?: LocationObject[] }).locations;
    if (!locations || locations.length === 0) return;

    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue: PendingPoint[] = raw ? JSON.parse(raw) : [];
      for (const location of locations) {
        const speed = location.coords.speed;
        queue.push({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speedKmh: speed != null && speed >= 0 ? speed * 3.6 : null,
          at: location.timestamp,
        });
      }
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
    } catch {
      // La siguiente actualización reintenta; no hay que romper el servicio.
    }
  });
}

// Arranca el registro en segundo plano solo si el usuario ya concedió los
// permisos. En Android usa un servicio en primer plano con notificación.
export async function startBackgroundTracking(): Promise<boolean> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) return false;

    const background = await Location.getBackgroundPermissionsAsync();
    if (!background.granted) return false;

    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) return true;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'Caravana',
        notificationBody: 'Registrando tu ruta en segundo plano.',
        notificationColor: '#FF5A1F',
      },
    });
    return true;
  } catch {
    return false;
  }
}

// Puntos acumulados por el servicio de fondo, listos para fusionar en la ruta.
export async function takePendingPoints(): Promise<PendingPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    await AsyncStorage.removeItem(QUEUE_KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingPoint[]) : [];
  } catch {
    return [];
  }
}
