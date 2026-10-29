import { Alert } from 'react-native';

export function errorMessage(error: unknown, fallback = 'Inténtalo de nuevo.') {
  return error instanceof Error && error.message ? error.message : fallback;
}

// En web Alert.alert usa los diálogos del navegador (ver web-alert.ts).
export function showError(title: string, error: unknown, fallback?: string) {
  Alert.alert(title, errorMessage(error, fallback));
}
