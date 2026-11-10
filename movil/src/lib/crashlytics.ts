import { Platform } from 'react-native';

import { setErrorReporter } from '@/src/lib/error-log';

// Firebase Crashlytics: los cierres de la app (nativos y de JavaScript) y los
// errores que ya guarda error-log llegan a la consola de Firebase, con el
// dispositivo y la versión, sin esperar a que alguien los cuente. Se carga en
// diferido: sin Firebase en la compilación (web, pruebas) no hace nada.

type CrashlyticsModule = typeof import('@react-native-firebase/crashlytics');

let crashlytics: { module: CrashlyticsModule; instance: ReturnType<CrashlyticsModule['getCrashlytics']> } | null = null;

function load() {
  if (crashlytics || Platform.OS === 'web') return crashlytics;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@react-native-firebase/crashlytics') as CrashlyticsModule;
    crashlytics = { module, instance: module.getCrashlytics() };
  } catch {
    crashlytics = null;
  }
  return crashlytics;
}

export function installCrashlytics() {
  if (!load()) return;
  setErrorReporter((source, error) => {
    const current = load();
    if (!current) return;
    const value = error instanceof Error ? error : new Error(String(error));
    current.module.recordError(current.instance, value, source);
  });
}

// Quién tuvo el fallo (solo el id de la cuenta, nunca correo ni nombre).
export function setCrashlyticsUser(accountId: string | null) {
  const current = load();
  if (!current) return;
  void current.module.setUserId(current.instance, accountId ?? '').catch(() => undefined);
}
