import { useMemo } from 'react';

import { currentUser } from '@/src/data/mock';
import { useAuth } from '@/src/store/auth';

/**
 * Datos del piloto conectado. En modo demo devuelve el perfil local; con
 * Supabase usa el nombre y username reales del perfil.
 */
export function useCurrentUser() {
  const account = useAuth((state) => state.account);

  return useMemo(
    () => ({
      ...currentUser,
      id: account?.id ?? currentUser.id,
      name: account?.displayName ?? currentUser.name,
      username: account?.username ?? currentUser.username,
      avatarUrl: account?.avatarUrl,
    }),
    [account],
  );
}
