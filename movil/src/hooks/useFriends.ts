import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { friends as mockFriends } from '@/src/data/mock';
import { isDemoMode } from '@/src/lib/demo';
import type { FriendEntry, FriendshipRow } from '@/src/lib/friends';
import {
  mapProfileRow,
  PROFILE_COLUMNS,
  type ProfileRow,
  type UserProfile,
} from '@/src/lib/profile-db';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';

function demoFriendProfile(friend: (typeof mockFriends)[number]): UserProfile {
  return {
    id: friend.id,
    username: friend.username,
    displayName: friend.name,
    bio: 'Rutas de fin de semana, café y buenas curvas.',
    city: 'Santo Domingo, RD',
    countryCode: 'DO',
    avatarUrl: null,
    privacy: 'public',
    qrSlug: friend.username,
    createdAt: '2023-01-01T00:00:00Z',
  };
}

function demoEntries(): FriendEntry[] {
  return mockFriends.map((friend) => ({
    id: `demo_friend_${friend.id}`,
    profile: demoFriendProfile(friend),
    status: 'accepted' as const,
    direction: 'friends' as const,
    createdAt: '2024-01-01T00:00:00Z',
  }));
}

export function useFriends() {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  const query = useQuery({
    queryKey: ['friendships', account?.id ?? 'guest', demo ? 'demo' : 'supabase'],
    enabled: Boolean(account) && !demo,
    queryFn: async () => {
      if (!account || !supabase) {
        return { entries: [] as FriendEntry[] };
      }

      const { data: rows, error } = await supabase
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${account.id},addressee_id.eq.${account.id}`)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      const friendships = (rows ?? []) as FriendshipRow[];
      const otherIds = [
        ...new Set(
          friendships.map((row) =>
            row.requester_id === account.id ? row.addressee_id : row.requester_id,
          ),
        ),
      ];

      if (otherIds.length === 0) {
        return { entries: [] as FriendEntry[] };
      }

      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .in('id', otherIds);

      if (profileError) throw new Error(profileError.message);

      const profileMap = new Map(
        ((profiles ?? []) as ProfileRow[]).map((row) => [row.id, mapProfileRow(row)]),
      );

      const entries = friendships.flatMap((row) => {
        const incoming = row.addressee_id === account.id;
        const otherId = incoming ? row.requester_id : row.addressee_id;
        const profile = profileMap.get(otherId);
        if (!profile) return [];
        return [
          {
            id: row.id,
            profile,
            status: row.status,
            direction:
              row.status === 'accepted'
                ? ('friends' as const)
                : incoming
                  ? ('incoming' as const)
                  : ('outgoing' as const),
            createdAt: row.created_at,
          },
        ];
      });

      return { entries };
    },
  });

  const entries = demo ? demoEntries() : query.data?.entries ?? [];
  const friends = entries
    .filter((entry) => entry.status === 'accepted')
    .sort((a, b) => a.profile.displayName.localeCompare(b.profile.displayName));
  const incoming = entries.filter(
    (entry) => entry.status === 'pending' && entry.direction === 'incoming',
  );
  const outgoing = entries.filter(
    (entry) => entry.status === 'pending' && entry.direction === 'outgoing',
  );

  return {
    entries,
    friends,
    incoming,
    outgoing,
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    error: demo ? null : query.error,
    refetch: query.refetch,
    isDemo: demo,
  };
}

function friendlyFriendshipError(code: string | undefined, message: string) {
  if (code === '23505') {
    return 'Ya existe una solicitud o amistad con esta persona.';
  }
  if (code === '42501' || message.toLowerCase().includes('row-level security')) {
    return 'No tienes permiso para realizar esta acción.';
  }
  return 'No pudimos completar la solicitud. Inténtalo de nuevo.';
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async (targetId: string) => {
      if (demo) {
        throw new Error('Las solicitudes de amistad no se guardan en modo demo.');
      }
      if (!supabase || !account) {
        throw new Error('Inicia sesión para añadir amigos.');
      }

      const { error } = await supabase.from('friendships').insert({
        requester_id: account.id,
        addressee_id: targetId,
        status: 'pending',
      });

      if (error) {
        throw new Error(friendlyFriendshipError(error.code, error.message));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friendships'] });
    },
  });
}

export function useRespondFriendRequest() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (demo) {
        throw new Error('Las solicitudes de amistad no se guardan en modo demo.');
      }
      if (!supabase || !account) {
        throw new Error('Inicia sesión para responder solicitudes.');
      }

      const { error } = await supabase
        .from('friendships')
        .update({
          status: accept ? 'accepted' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('addressee_id', account.id);

      if (error) {
        throw new Error(friendlyFriendshipError(error.code, error.message));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friendships'] });
      void queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    },
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async (friendshipId: string) => {
      if (demo) {
        throw new Error('Las amistades de la demo no se pueden eliminar.');
      }
      if (!supabase || !account) {
        throw new Error('Inicia sesión para gestionar tus amigos.');
      }

      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);

      if (error) {
        throw new Error(friendlyFriendshipError(error.code, error.message));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friendships'] });
      void queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    },
  });
}

export function useSearchProfiles(rawQuery: string) {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const term = rawQuery.trim().replace(/[%,()]/g, '').slice(0, 40);

  const query = useQuery({
    queryKey: ['profile-search', term, demo ? 'demo' : 'supabase'],
    enabled: term.length >= 2,
    queryFn: async (): Promise<UserProfile[]> => {
      if (term.length < 2) return [];

      if (demo) {
        return mockFriends
          .filter(
            (friend) =>
              friend.name.toLowerCase().includes(term.toLowerCase()) ||
              friend.username.toLowerCase().includes(term.toLowerCase()),
          )
          .map(demoFriendProfile);
      }

      if (!supabase || !account) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .neq('id', account.id)
        .limit(20);

      if (error) throw new Error(error.message);
      return ((data ?? []) as ProfileRow[]).map(mapProfileRow);
    },
  });

  return {
    profiles: query.data ?? [],
    isLoading: term.length >= 2 ? query.isLoading : false,
    isError: query.isError,
    error: query.error,
  };
}
