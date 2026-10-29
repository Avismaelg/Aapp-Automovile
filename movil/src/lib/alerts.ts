import { Alert, Platform } from 'react-native';

export function errorMessage(error: unknown, fallback = 'Inténtalo de nuevo.') {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Alert.alert no hace nada en react-native-web: allí el error se perdería.
export function showError(title: string, error: unknown, fallback?: string) {
  const message = errorMessage(error, fallback);
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
