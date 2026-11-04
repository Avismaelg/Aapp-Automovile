import AsyncStorage from '@react-native-async-storage/async-storage';

// RNF-15 / RNF-21: registro local de los últimos errores (pantallas que
// fallan, errores globales y promesas rechazadas sin manejar) para revisarlos
// cada semana. Se queda en el teléfono; un servicio externo (p. ej. Sentry)
// puede engancharse en recordError sin tocar el resto de la app.

const KEY = 'caravana.error-log';
export const MAX_ERRORS = 50;

export type ErrorEntry = { at: string; source: 'render' | 'global' | 'promise'; message: string; stack?: string };

let queue: Promise<void> = Promise.resolve();

// Servicio externo (Crashlytics) que recibe cada error además del registro local.
type ErrorReporter = (source: ErrorEntry['source'], error: unknown) => void;
let reporter: ErrorReporter | null = null;
export function setErrorReporter(next: ErrorReporter | null) {
  reporter = next;
}

export function appendError(list: ErrorEntry[], entry: ErrorEntry) {
  return [entry, ...list].slice(0, MAX_ERRORS);
}

export function recordError(source: ErrorEntry['source'], error: unknown) {
  try {
    reporter?.(source, error);
  } catch {
    // El servicio externo nunca debe romper el registro local.
  }
  const entry: ErrorEntry = {
    at: new Date().toISOString(),
    source,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split('\n').slice(0, 6).join('\n') : undefined,
  };
  queue = queue.then(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const list = raw ? (JSON.parse(raw) as ErrorEntry[]) : [];
      await AsyncStorage.setItem(KEY, JSON.stringify(appendError(list, entry)));
    } catch {
      // Sin almacenamiento no hay registro, pero la app sigue.
    }
  });
  return queue;
}

export async function readErrorLog(): Promise<ErrorEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ErrorEntry[]) : [];
  } catch {
    return [];
  }
}

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};
type HermesLike = {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, error: unknown) => void;
  }) => void;
};

let installed = false;

// Engancha el registro a los errores globales y a las promesas sin manejar.
export function installErrorLogging() {
  if (installed) return;
  installed = true;
  const scope = globalThis as unknown as { ErrorUtils?: ErrorUtilsLike; HermesInternal?: HermesLike };
  const errorUtils = scope.ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      void recordError('global', error);
      previous(error, isFatal);
    });
  }
  scope.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, error) => {
      void recordError('promise', error);
    },
  });
}
