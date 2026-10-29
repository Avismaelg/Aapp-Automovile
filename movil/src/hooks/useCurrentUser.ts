import { useMemo } from 'react';

import { currentUser } from '@/src/data/mock';
import { isDemoMode } from '@/src/lib/demo';
import { profileColor } from '@/src/lib/profile-db';
import { useAuth } from '@/src/store/auth';

/**
 * Datos del piloto conectado. En modo demo devuelve el perfil de ejemplo; con
 * una cuenta real solo usa datos reales y deja vacío lo que no conocemos
 * (nunca la ciudad, la bio o las estadísticas del perfil de ejemplo).
 */
export function useCurrentUser() {
  const account = useAuth((state) => state.account);

  return useMemo(() => {
    if (!account || isDemoMode(account.mode)) {
      return {
        ...currentUser,
        id: account?.id ?? currentUser.id,
        name: account?.displayName ?? currentUser.name,
        username: account?.username ?? currentUser.username,
        avatarUrl: account?.avatarUrl,
      };
    }
    return {
      ...currentUser,
      id: account.id,
      name: account.displayName,
      username: account.username,
      avatarUrl: account.avatarUrl,
      city: '',
      bio: '',
      color: profileColor(account.username),
      stats: { drives: 0, km: 0, hours: 0, friends: 0 },
    };
  }, [account]);
}
