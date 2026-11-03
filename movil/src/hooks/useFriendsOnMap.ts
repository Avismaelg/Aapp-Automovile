import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { partyMembers } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFriends } from '@/src/hooks/useFriends';
import type { WorldMapMember } from '@/src/lib/map-html';
import {
  latestFriendPositions,
  SHARE_OUTSIDE_PARTY,
  type FriendLocationRow,
  type PositionedFriend,
} from '@/src/lib/party-invites';
import { profileColor } from '@/src/lib/profile-db';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { useLivePoll } from '@/src/hooks/useLivePoll';

export type MapFriend = WorldMapMember & { username: string; updatedAt?: number };

// Amigos visibles en el mapa personal. Su posición sale de lo que comparten
// con sus amigos (friend_locations) o, si estáis en la misma party, de la
// party; gana la más reciente. En demo se usan los pilotos de ejemplo.
export function useFriendsOnMap() {
  const me = useCurrentUser();
  const account = useAuth((state) => state.account);
  const { friends, isDemo } = useFriends();
  const [now, setNow] = useState(() => Date.now());

  const friendIds = useMemo(
    () => friends.map((friend) => friend.profile.id).sort(),
    [friends],
  );

  const livePoll = useLivePoll();
  const positionsQuery = useQuery({
    queryKey: ['friend-positions', friendIds.join(','), account?.id ?? 'guest'],
    enabled: !isDemo && isSupabaseConfigured && friendIds.length > 0,
    refetchInterval: livePoll,
    queryFn: async (): Promise<Map<string, PositionedFriend>> => {
      if (!supabase) return new Map();
      const [shared, party] = await Promise.all([
        // RNF-10: fuera de una party no se lee la posición de nadie.
        SHARE_OUTSIDE_PARTY
          ? supabase
              .from('friend_locations')
              .select('user_id, lat, lng, updated_at')
              .in('user_id', friendIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('party_members')
          .select('user_id, last_lat, last_lng, last_seen_at')
          .in('user_id', friendIds)
          .is('left_at', null)
          .not('last_lat', 'is', null),
      ]);
      // Sin la tabla nueva (servidor sin actualizar) sigue valiendo la party.
      const sources = [
        ...((shared.error ? [] : shared.data ?? []) as FriendLocationRow[]).map((row) => ({
          userId: row.user_id,
          lat: row.lat,
          lng: row.lng,
          at: row.updated_at,
        })),
        ...((party.error ? [] : party.data ?? []) as {
          user_id: string;
          last_lat: number | null;
          last_lng: number | null;
          last_seen_at: string | null;
        }[]).map((row) => ({
          userId: row.user_id,
          lat: row.last_lat,
          lng: row.last_lng,
          at: row.last_seen_at,
        })),
      ];
      setNow(Date.now());
      return latestFriendPositions(sources, Date.now());
    },
  });

  const members = useMemo<MapFriend[]>(() => {
    if (isDemo) {
      return partyMembers
        .filter((member) => member.username !== me.username)
        .map((member) => ({
          id: member.id,
          name: member.name,
          username: member.username,
          color: member.color,
          latitude: member.latitude,
          longitude: member.longitude,
          isTalking: member.isTalking,
          battery: member.battery,
        }));
    }

    const positions = positionsQuery.data ?? new Map<string, PositionedFriend>();
    return friends.flatMap((friend) => {
      const position = positions.get(friend.profile.id);
      if (!position) return [];
      return [
        {
          id: friend.profile.id,
          name: friend.profile.displayName,
          username: friend.profile.username,
          color: profileColor(friend.profile.username),
          latitude: position.latitude,
          longitude: position.longitude,
          updatedAt: position.updatedAt,
          isTalking: false,
        },
      ];
    });
  }, [isDemo, me.username, friends, positionsQuery.data]);

  return {
    members,
    friendCount: friends.length,
    now,
    isDemo,
    isLoading: !isDemo && positionsQuery.isLoading,
    refetch: positionsQuery.refetch,
  };
}
