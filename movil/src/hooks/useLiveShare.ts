import { useEffect } from 'react';

import type { LiveLocation } from '@/src/hooks/useLiveLocation';
import { pushLivePosition, setLiveShareConfig } from '@/src/lib/live-share';
import { sharesWithFriends } from '@/src/lib/party-invites';
import { supabase } from '@/src/lib/supabase';
import { setConvoyMode } from '@/src/lib/tracking';
import { useAuth } from '@/src/store/auth';
import { useSharing } from '@/src/store/sharing';

// Tu posición en vivo para la party y para tus amigos, con la app abierta. Con
// la pantalla bloqueada la sube la tarea de segundo plano (src/lib/tracking.ts)
// usando la misma configuración.
export function useLiveShare(
  location: LiveLocation,
  { partyId, enabled, hasFriends }: { partyId: string | null; enabled: boolean; hasFriends: boolean },
) {
  const accountId = useAuth((state) => state.account?.id ?? null);
  // Salvo que digas que no (activado por defecto; ver sharesWithFriends).
  const chosen = useSharing((state) => sharesWithFriends(state.shareWithFriends));
  // Sin amigos no hay a quién mostrarle tu posición: ni se sube ni se
  // mantiene el GPS rápido en segundo plano (batería).
  const friends = chosen && hasFriends;
  const declined = !chosen;

  useEffect(() => {
    void setLiveShareConfig({ accountId, partyId, friends });
    void setConvoyMode(Boolean(partyId), friends);
  }, [accountId, partyId, friends]);

  useEffect(() => {
    if (!enabled) return;
    void pushLivePosition({
      latitude: location.latitude,
      longitude: location.longitude,
      speedKmh: location.speedKmh,
      heading: location.heading,
      at: Date.now(),
    });
  }, [enabled, location]);

  // Sin compartir con amigos (RNF-10) se borra tu última posición del servidor.
  useEffect(() => {
    if (!declined || !accountId || !supabase) return;
    void supabase.from('friend_locations').delete().eq('user_id', accountId);
  }, [declined, accountId]);
}
