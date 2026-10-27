import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { partyMembers } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFriends } from '@/src/hooks/useFriends';
import type { WorldMapMember } from '@/src/lib/map-html';
import { profileColor } from '@/src/lib/profile-db';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';

export type MapFriend = {
  id: string;
  name: string;
  username: string;
  color: string;
  latitude: number;
  longitude: number;
};

// Amigos visibles en el mapa personal: su última posición conocida es la de la
// última party en la que compartieron ubicación. En demo se usan los pilotos de
// ejemplo.
export function useFriendsOnMap() {
  const me = useCurrentUser();
  const account = useAuth((state) => state.account);
  const { friends, isDemo } = useFriends();

  const friendIds = useMemo(() => friends.map((friend) => friend.profile.id), [friends]);

  const positionsQuery = useQuery({
    queryKey: ['friend-positions', friendIds.sort().join(','), account?.id ?? 'guest'],
    enabled: !isDemo && isSupabaseConfigured && friendIds.length > 0,
    queryFn: async () => {
      if (!supabase) return new Map<string, { latitude: number; longitude: number }>();

      const { data, error } = await supabase
        .from('party_members')
        .select('user_id, last_lat, last_lng, last_seen_at')
        .in('user_id', friendIds)
        .not('last_lat', 'is', null)
        .not('last_lng', 'is', null)
        .order('last_seen_at', { ascending: false })
        .limit(200);

      if (error) throw new Error(error.message);

      const latest = new Map<string, { latitude: number; longitude: number }>();
      for (const row of (data ?? []) as {
        user_id: string;
        last_lat: number | null;
        last_lng: number | null;
      }[]) {
        if (row.last_lat == null || row.last_lng == null) continue;
        if (latest.has(row.user_id)) continue;
        latest.set(row.user_id, { latitude: row.last_lat, longitude: row.last_lng });
      }
      return latest;
    },
  });

  const members = useMemo<WorldMapMember[]>(() => {
    if (isDemo) {
      return partyMembers
        .filter((member) => member.username !== me.username)
        .map((member) => ({
          id: member.id,
          name: member.name,
          color: member.color,
          latitude: member.latitude,
          longitude: member.longitude,
          isTalking: member.isTalking,
          battery: member.battery,
        }));
    }

    const positions = positionsQuery.data ?? new Map();
    return friends.flatMap((friend) => {
      const position = positions.get(friend.profile.id);
      if (!position) return [];
      return [
        {
          id: friend.profile.id,
          name: friend.profile.displayName,
          color: profileColor(friend.profile.username),
          latitude: position.latitude,
          longitude: position.longitude,
          isTalking: false,
        },
      ];
    });
  }, [isDemo, me.username, friends, positionsQuery.data]);

  return {
    members,
    isDemo,
    isLoading: !isDemo && positionsQuery.isLoading,
    refetch: positionsQuery.refetch,
  };
}
