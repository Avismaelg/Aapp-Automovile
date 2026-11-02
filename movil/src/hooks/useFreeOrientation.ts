import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Platform } from 'react-native';

// UI-04 / RF-15: la app va en vertical, pero el modo conducción (y la
// navegación activa) giran con el teléfono para usarlo en un soporte
// horizontal. Al salir se vuelve a fijar el vertical.
export function useFreeOrientation(active: boolean) {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const apply = active
      ? ScreenOrientation.unlockAsync()
      : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    apply.catch(() => {});
    return () => {
      if (active) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
  }, [active]);
}
