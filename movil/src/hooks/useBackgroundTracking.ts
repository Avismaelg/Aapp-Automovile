import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { Alert, AppState, Platform } from 'react-native';

import {
  hasMotionPermission,
  isIgnoringBatteryOptimizations,
  motionAvailable,
  requestIgnoreBatteryOptimizations,
  requestMotionPermission,
  startMotionUpdates,
} from '@/modules/motion';
import { whenHydrated } from '@/src/lib/hydration';
import { resumeTracking, stopTracking } from '@/src/lib/tracking';
import { useSession } from '@/src/store/session';

const BATTERY_ASKED_KEY = 'caravana.battery-asked-at';
const MOTION_ASKED_KEY = 'caravana.motion-asked-at';
const ASK_AGAIN_MS = 7 * 24 * 3_600_000;

async function askedRecently(key: string) {
  const raw = await AsyncStorage.getItem(key).catch(() => null);
  return raw != null && Date.now() - Number(raw) < ASK_AGAIN_MS;
}

async function markAsked(key: string) {
  await AsyncStorage.setItem(key, String(Date.now())).catch(() => undefined);
}

// Sensor de actividad: distingue ir en coche de ir a pie (atascos ≠ aparcar).
// El permiso «Actividad física» se pide una vez; si se niega, se vuelve a
// intentar como mucho una vez por semana.
async function ensureMotion() {
  if (!motionAvailable) return;
  if (!hasMotionPermission()) {
    if (await askedRecently(MOTION_ASKED_KEY)) return;
    await markAsked(MOTION_ASKED_KEY);
    if (!(await requestMotionPermission())) return;
  }
  await startMotionUpdates();
}

// Sin exención de ahorro de batería Android (sobre todo Samsung) mata el
// servicio de ubicación con la app cerrada y los viajes no se graban.
async function ensureBatteryExemption() {
  if (isIgnoringBatteryOptimizations()) return;
  if (await askedRecently(BATTERY_ASKED_KEY)) return;
  await markAsked(BATTERY_ASKED_KEY);
  Alert.alert(
    'Graba tus rutas con la app cerrada',
    'Android está limitando a Caravana por ahorro de batería y deja de registrar tus viajes y dónde aparcas. Permite que funcione sin restricciones.',
    [
      { text: 'Ahora no', style: 'cancel' },
      { text: 'Permitir', onPress: () => void requestIgnoreBatteryOptimizations() },
    ],
  );
}

// Mantiene el servicio de fondo alineado con la preferencia guardada cada vez
// que la app pasa a primer plano: lo relanza si el sistema lo paró y lo
// detiene si el usuario lo pausó.
export function useBackgroundTracking(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    let cancelled = false;

    const sync = async () => {
      if (AppState.currentState !== 'active') return;
      await whenHydrated(useSession);
      if (cancelled) return;

      const { trackingEnabled, setTrackingEnabled } = useSession.getState();
      if (!trackingEnabled) {
        await stopTracking().catch(() => undefined);
        return;
      }
      // Sin permiso "Siempre" no hay tracking real: se muestra en pausa para
      // que el usuario lo active (y conceda el permiso) desde Ajustes.
      const result = await resumeTracking();
      if (result === 'no-permission' && !cancelled) setTrackingEnabled(false);
      if (result !== 'running' || cancelled) return;
      await ensureMotion().catch(() => undefined);
      if (!cancelled) await ensureBatteryExemption().catch(() => undefined);
    };

    void sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [enabled]);
}
