import { Alert } from 'react-native';
import { t } from '@/src/i18n';

export function errorMessage(error: unknown, fallback = t('Inténtalo de nuevo.')) {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Error de supabase.functions.invoke: el motivo real (p. ej. «daily_limit»)
// viene en el cuerpo JSON de la respuesta; si no lo hay, vale el mensaje.
export async function extractFunctionError(error: {
  message: string;
  context?: Response;
}): Promise<{ message: string; status?: number }> {
  let message = error.message;
  const context = error.context;
  if (context) {
    try {
      const payload = (await context.clone().json()) as { error?: string } | null;
      if (payload?.error) message = payload.error;
    } catch {
      // Sin cuerpo JSON: vale el mensaje original.
    }
  }
  return { message, status: context?.status };
}

// En web Alert.alert usa los diálogos del navegador (ver web-alert.ts).
export function showError(title: string, error: unknown, fallback?: string) {
  Alert.alert(title, errorMessage(error, fallback));
}
