import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { saveBackgroundBatch, type BackgroundPoint } from '@/src/lib/background-points';
import { checkBackgroundAlerts } from '@/src/lib/background-alerts';
import { askLocationConsent } from '@/src/lib/location-consent';
import { pushLivePosition } from '@/src/lib/live-share';
import { t } from '@/src/i18n';

const TASK_NAME = 'caravana-background-location';
// Un fix con más error que esto ensucia la ruta más de lo que aporta.
// Dentro de casa el GPS llega a 100-300 m de error y fabrica rutas falsas.
const MAX_ACCURACY_M = 50;

const UPDATE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 15_000,
  distanceInterval: 25,
  deferredUpdatesInterval: 30_000,
  activityType: Location.ActivityType.AutomotiveNavigation,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: t('Caravana está registrando tu ruta'),
    notificationBody: t('Tu viaje se guarda automáticamente. Toca para abrir.'),
    notificationColor: '#FF5A1F',
    // El servicio sigue aunque el usuario cierre la app desde recientes.
    killServiceOnDestroy: false,
  },
};

// En una party la posición se comparte en vivo: puntos cada 3 s y sin
// agruparlos (los lotes de 30 s dejaban a los demás viéndote a saltos).
const CONVOY_OPTIONS: Location.LocationTaskOptions = {
  ...UPDATE_OPTIONS,
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 3_000,
  distanceInterval: 8,
  deferredUpdatesInterval: 0,
  foregroundService: {
    ...UPDATE_OPTIONS.foregroundService!,
    notificationTitle: t('Caravana · convoy en vivo'),
    notificationBody: t('Tu party ve tu posición. Toca para abrir.'),
  },
};

let convoyMode = false;
const currentOptions = () => (convoyMode ? CONVOY_OPTIONS : UPDATE_OPTIONS);

// Entrar o salir de una party cambia el ritmo del servicio. Debe llamarse con
// la app en primer plano (Android no deja arrancar el servicio desde fondo).
export async function setConvoyMode(enabled: boolean) {
  if (Platform.OS === 'web' || enabled === convoyMode) return;
  convoyMode = enabled;
  try {
    if (!(await hasTrackingPermissions())) return;
    if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
      await Location.startLocationUpdatesAsync(TASK_NAME, currentOptions());
    }
  } catch {
    // Se reintenta en el próximo resumeTracking.
  }
}

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
      // La más reciente va a la party y a los amigos (con la pantalla
      // bloqueada también).
      const latest = data.locations[data.locations.length - 1];
      if (latest && (latest.coords.accuracy ?? 0) <= MAX_ACCURACY_M) {
        const { latitude, longitude, speed, heading } = latest.coords;
        void pushLivePosition({
          latitude,
          longitude,
          at: latest.timestamp,
          speedKmh: speed != null && speed >= 0 ? speed * 3.6 : null,
          heading: heading != null && heading >= 0 ? heading : null,
        });
      }
      // Invitaciones, retos y cambios de destino con la app cerrada.
      void checkBackgroundAlerts();
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
  if (!(await askLocationConsent())) return false;
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

async function ensureUpdatesRunning() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) return;
  await Location.startLocationUpdatesAsync(TASK_NAME, currentOptions());
}

export async function startTracking() {
  if (Platform.OS === 'web') {
    throw new Error(t('El tracking en segundo plano no está disponible en web.'));
  }

  const hasPermission = await requestTrackingPermissions();
  if (!hasPermission) {
    throw new Error(t('Necesitamos permiso de ubicación “Siempre” para registrar tus rutas.'));
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
//
// Ojo: si Android mata la app, el registro de la tarea sigue («started») pero
// el servicio en primer plano ha muerto y solo llegan ubicaciones sueltas un
// par de veces por hora. Por eso se reinicia siempre.
export async function resumeTracking(): Promise<ResumeResult> {
  if (Platform.OS === 'web') return 'error';
  try {
    if (!(await hasTrackingPermissions())) return 'no-permission';
    if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
    }
    await Location.startLocationUpdatesAsync(TASK_NAME, currentOptions());
    return 'running';
  } catch {
    return 'error';
  }
}
