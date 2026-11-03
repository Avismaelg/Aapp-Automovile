import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import {
  setAutoDriving,
  setDrivingTexts,
  startDriving,
  stopDriving,
} from '@/modules/motion';
import { saveBackgroundBatch, type BackgroundPoint } from '@/src/lib/background-points';
import { nextDrivingState, type DrivingTracker } from '@/src/lib/driving-state';
import { checkBackgroundAlerts } from '@/src/lib/background-alerts';
import { askLocationConsent } from '@/src/lib/location-consent';
import { pushLivePosition } from '@/src/lib/live-share';
import { t } from '@/src/i18n';

const TASK_NAME = 'caravana-background-location';
// Un fix con más error que esto ensucia la ruta más de lo que aporta.
// Dentro de casa el GPS llega a 100-300 m de error y fabrica rutas falsas.
const MAX_ACCURACY_M = 50;

// En Android el registro va sin notificación: parado, el sistema entrega la
// ubicación unas pocas veces por hora (basta para recoger datos). Al conducir
// o en una party, el servicio de conducción del módulo Motion (con su
// notificación) hace que llegue a ritmo completo; ver DrivingService.kt.
const UPDATE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 15_000,
  distanceInterval: 25,
  deferredUpdatesInterval: 30_000,
  activityType: Location.ActivityType.AutomotiveNavigation,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
};

// En una party la posición se comparte en vivo: puntos cada 3 s y sin
// agruparlos (los lotes de 30 s dejaban a los demás viéndote a saltos).
const CONVOY_OPTIONS: Location.LocationTaskOptions = {
  ...UPDATE_OPTIONS,
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 3_000,
  distanceInterval: 8,
  deferredUpdatesInterval: 0,
};

// Textos de la notificación, ya traducidos, para el servicio nativo. En una
// party el texto avisa de que los demás te ven; la notificación sigue saliendo
// solo mientras te mueves.
function shareDrivingTexts() {
  setDrivingTexts({
    channel: t('Conducción'),
    drivingTitle: convoyMode ? t('Caravana · convoy en vivo') : t('Caravana está registrando tu ruta'),
    drivingBody: convoyMode
      ? t('Tu party ve tu posición. Toca para abrir.')
      : t('Tu viaje se guarda automáticamente. Toca para abrir.'),
    convoyTitle: t('Caravana · convoy en vivo'),
    convoyBody: t('Tu party ve tu posición. Toca para abrir.'),
    voiceTitle: t('Caravana · voz del convoy activa'),
    voiceBody: t('Oyes a tu party con la pantalla bloqueada. Toca para abrir.'),
  });
}

// Respaldo por GPS del sensor de actividad: notificación al moverte en un
// vehículo y fuera tras unos minutos parado.
let driving: DrivingTracker = { active: false, lastMovingAt: null };
function updateDriving(speedKmh: number | null, at: number) {
  const next = nextDrivingState(driving, speedKmh, at);
  driving = next.state;
  if (next.action === 'start') startDriving('vehicle');
  if (next.action === 'stop') stopDriving('vehicle');
}

let convoyMode = false;
const currentOptions = () => (convoyMode ? CONVOY_OPTIONS : UPDATE_OPTIONS);

// Entrar o salir de una party cambia el ritmo del servicio. Debe llamarse con
// la app en primer plano (Android no deja arrancar el servicio desde fondo).
export async function setConvoyMode(enabled: boolean) {
  if (Platform.OS === 'web' || enabled === convoyMode) return;
  convoyMode = enabled;
  shareDrivingTexts();
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
      if (latest) {
        const speed = latest.coords.speed;
        updateDriving(speed != null && speed >= 0 ? speed * 3.6 : null, latest.timestamp);
      }
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
  shareDrivingTexts();
  setAutoDriving(true);
  await ensureUpdatesRunning();
}

export async function stopTracking() {
  if (Platform.OS === 'web') return;
  setAutoDriving(false);
  stopDriving('vehicle');
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
// Se reinicia siempre: si Android mató la app, el registro de la tarea sigue
// («started») pero ya no entrega ubicaciones.
export async function resumeTracking(): Promise<ResumeResult> {
  if (Platform.OS === 'web') return 'error';
  try {
    if (!(await hasTrackingPermissions())) return 'no-permission';
    shareDrivingTexts();
    setAutoDriving(true);
    if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
    }
    await Location.startLocationUpdatesAsync(TASK_NAME, currentOptions());
    return 'running';
  } catch {
    return 'error';
  }
}
