import { useEffect } from 'react';

import type { LiveLocation } from '@/src/hooks/useLiveLocation';
import { pushLivePosition, setLiveShareConfig } from '@/src/lib/live-share';
import { SHARE_OUTSIDE_PARTY } from '@/src/lib/party-invites';
import { supabase } from '@/src/lib/supabase';
import { setConvoyMode } from '@/src/lib/tracking';
import { useAuth } from '@/src/store/auth';
import { useSharing } from '@/src/store/sharing';

// Tu posición en vivo para la party y para tus amigos, con la app abierta. Con
// la pantalla bloqueada la sube la tarea de segundo plano (src/lib/tracking.ts)
// usando la misma configuración.
export function useLiveShare(
  location: LiveLocation,
  { partyId, enabled }: { partyId: string | null; enabled: boolean },
) {
  const accountId = useAuth((state) => state.account?.id ?? null);
  const chosen = useSharing((state) => state.shareWithFriends === true);
  const friends = SHARE_OUTSIDE_PARTY && chosen;
  const declined = !friends;

  useEffect(() => {
    void setLiveShareConfig({ accountId, partyId, friends });
    void setConvoyMode(Boolean(partyId));
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
