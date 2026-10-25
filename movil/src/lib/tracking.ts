import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

const TASK_NAME = 'caravana-background-location';
const STORAGE_KEY = 'caravana.tracking.session';

export type TrackingPoint = {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

export type TrackingSession = {
  active: boolean;
  startedAt: number | null;
  endedAt: number | null;
  points: TrackingPoint[];
  distanceM: number;
};

const EMPTY_SESSION: TrackingSession = {
  active: false,
  startedAt: null,
  endedAt: null,
  points: [],
  distanceM: 0,
};

function haversineMeters(a: TrackingPoint, b: TrackingPoint) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function readSession(): Promise<TrackingSession> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...EMPTY_SESSION };
  try {
    return { ...EMPTY_SESSION, ...(JSON.parse(raw) as TrackingSession) };
  } catch {
    return { ...EMPTY_SESSION };
  }
}

async function writeSession(session: TrackingSession) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] })?.locations;
    if (!locations?.length) return;

    const session = await readSession();
    if (!session.active) return;

    const newPoints: TrackingPoint[] = locations.map((loc) => ({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      speed: loc.coords.speed,
      heading: loc.coords.heading,
      timestamp: loc.timestamp,
    }));

    let distance = session.distanceM;
    const all = [...session.points, ...newPoints];
    for (let i = Math.max(1, session.points.length); i < all.length; i += 1) {
      const delta = haversineMeters(all[i - 1], all[i]);
      if (delta < 250) distance += delta; // descarta saltos de GPS
    }

    await writeSession({
      ...session,
      points: all.slice(-5000),
      distanceM: distance,
    });
  });
}

export async function requestTrackingPermissions() {
  if (Platform.OS === 'web') return false;
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

export async function startTracking() {
  if (Platform.OS === 'web') {
    throw new Error('El tracking en segundo plano no está disponible en web.');
  }

  const hasPermission = await requestTrackingPermissions();
  if (!hasPermission) {
    throw new Error('Necesitamos permiso de ubicación “Siempre” para registrar tus rutas.');
  }

  const session = await readSession();
  await writeSession({
    ...session,
    active: true,
    startedAt: session.startedAt ?? Date.now(),
    endedAt: null,
  });

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (!alreadyRunning) {
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15000,
      distanceInterval: 25,
      deferredUpdatesInterval: 30000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Caravana está registrando tu ruta',
        notificationBody: 'Tu viaje se guarda automáticamente. Toca para abrir.',
        notificationColor: '#FF5A1F',
      },
    });
  }
}

export async function stopTracking() {
  if (Platform.OS === 'web') return;
  const session = await readSession();
  await writeSession({ ...session, active: false, endedAt: Date.now() });
  const running = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (running) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}

export async function getTrackingSession() {
  return readSession();
}

export async function clearTrackingSession() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
