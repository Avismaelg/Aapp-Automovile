import { use } from 'react';
// Contexto de foco de la pantalla de expo-router. useIsFocused lanza un error
// fuera de una pantalla (p. ej. el aviso de invitación en la raíz); el
// contexto deja tratarlo como «visible».
import { IsFocusedContext } from 'expo-router/build/react-navigation/core/useIsFocused';

// SYNC-03: respaldo de 5 s para los datos que cambian. Solo mientras la
// pantalla está a la vista: las pestañas siguen montadas aunque no se vean y,
// sin esto, todas consultarían a la vez. Con la app en segundo plano TanStack
// ya no sondea (focusManager en app/_layout.tsx).
export const LIVE_POLL_MS = 5_000;

export function livePollInterval(focused: boolean | undefined, ms = LIVE_POLL_MS): number | false {
  return focused === false ? false : ms;
}

export function useLivePoll(ms = LIVE_POLL_MS): number | false {
  return livePollInterval(use(IsFocusedContext), ms);
}
