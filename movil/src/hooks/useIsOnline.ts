import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

// Hay red (NetInfo → onlineManager, configurado en app/_layout.tsx).
export function useIsOnline() {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}
