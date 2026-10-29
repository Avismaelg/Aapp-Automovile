import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { whenHydrated } from '@/src/lib/hydration';
import { resumeTracking, stopTracking } from '@/src/lib/tracking';
import { useSession } from '@/src/store/session';

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
