import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { saveBackgroundBatch, type BackgroundPoint } from '@/src/lib/background-points';

const TASK_NAME = 'caravana-background-location';
// Un fix con más error que esto ensucia la ruta más de lo que aporta.
const MAX_ACCURACY_M = 100;

const UPDATE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 15_000,
  distanceInterval: 25,
  deferredUpdatesInterval: 30_000,
  activityType: Location.ActivityType.AutomotiveNavigation,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Caravana está registrando tu ruta',
    notificationBody: 'Tu viaje se guarda automáticamente. Toca para abrir.',
    notificationColor: '#FF5A1F',
    // El servicio sigue aunque el usuario cierre la app desde recientes.
    killServiceOnDestroy: false,
  },
};

function toBackgroundPoint(location: Location.LocationObject): BackgroundPoint | null {
  const { latitude, longitude, speed, accuracy } = location.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (accuracy != null && accuracy > MAX_ACCURACY_M) return null;
  return {
    latitude,
    longitude,
    speedKmh: speed != null && Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null,
    at: location.timestamp,
  };
}

// Debe definirse al cargar el módulo (no dentro de un componente): cuando el
// sistema despierta la app en segundo plano solo ejecuta el código global.
// Por eso app/_layout.tsx importa este archivo.
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
    TASK_NAME,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      const points = data.locations
        .map(toBackgroundPoint)
        .filter((point): point is BackgroundPoint => point !== null);
      try {
        await saveBackgroundBatch(points);
      } catch {
        // Almacenamiento lleno u ocupado: se pierde este lote, no el servicio.
      }
    },
  );
}

async function hasTrackingPermissions() {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return foreground.granted && background.granted;
}

export async function requestTrackingPermissions() {
  if (Platform.OS === 'web') return false;
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

async function ensureUpdatesRunning() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) return;
  await Location.startLocationUpdatesAsync(TASK_NAME, UPDATE_OPTIONS);
}

export async function startTracking() {
  if (Platform.OS === 'web') {
    throw new Error('El tracking en segundo plano no está disponible en web.');
  }

  const hasPermission = await requestTrackingPermissions();
  if (!hasPermission) {
    throw new Error('Necesitamos permiso de ubicación “Siempre” para registrar tus rutas.');
  }
  await ensureUpdatesRunning();
}

export async function stopTracking() {
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}

export type ResumeResult = 'running' | 'no-permission' | 'error';

// El sistema puede haber parado el servicio (reinicio del teléfono,
// actualización de la app, ahorro de batería). Lo relanza sin pedir permisos:
// debe llamarse con la app en primer plano, Android no deja arrancar un
// servicio de ubicación desde segundo plano.
export async function resumeTracking(): Promise<ResumeResult> {
  if (Platform.OS === 'web') return 'error';
  try {
    if (!(await hasTrackingPermissions())) return 'no-permission';
    await ensureUpdatesRunning();
    return 'running';
  } catch {
    return 'error';
  }
}
