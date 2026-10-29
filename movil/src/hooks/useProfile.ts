import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  currentUser,
  friends,
  vehicles as mockVehicles,
  type Vehicle,
} from '@/src/data/mock';
import {
  mapProfileRow,
  PROFILE_COLUMNS,
  type ProfilePrivacy,
  type ProfileRow,
  type UserProfile,
} from '@/src/lib/profile-db';
import { isDemoMode } from '@/src/lib/demo';
import { mapVehicleRow, type VehicleRow } from '@/src/lib/vehicle-db';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { useDemoProfile } from '@/src/store/demoProfile';

export function useMyProfile() {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const demoProfile = useDemoProfile((state) => state.profile);
  const hydrateDemo = useDemoProfile((state) => state.hydrate);

  useEffect(() => {
    if (demo) void hydrateDemo();
  }, [demo, hydrateDemo]);

  const query = useQuery({
    queryKey: ['my-profile', account?.id ?? 'guest', demo ? 'demo' : 'supabase'],
    enabled: Boolean(account) && !demo,
    queryFn: async (): Promise<UserProfile | null> => {
      if (!account || !supabase) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', account.id)
        .maybeSingle<ProfileRow>();
      if (error) throw new Error(error.message);
      return data ? mapProfileRow(data) : null;
    },
  });

  const demoUser: UserProfile = {
    id: account?.id ?? currentUser.id,
    username: account?.username ?? currentUser.username,
    displayName: demoProfile.displayName,
    bio: demoProfile.bio,
    city: demoProfile.city,
    countryCode: 'DO',
    avatarUrl: account?.avatarUrl ?? null,
    privacy: demoProfile.privacy,
    qrSlug: account?.username ?? currentUser.username,
    createdAt: '2024-01-01T00:00:00Z',
  };

  return {
    profile: demo ? demoUser : query.data ?? null,
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    error: demo ? null : query.error,
    refetch: query.refetch,
    isDemo: demo,
  };
}

export type UpdateProfileInput = {
  displayName: string;
  bio: string;
  city: string;
  privacy: ProfilePrivacy;
};

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const syncAccount = useAuth((state) => state.syncAccount);
  const demo = isDemoMode(account?.mode);
  const updateDemo = useDemoProfile((state) => state.update);

  return useMutation({
    mutationFn: async (input: UpdateProfileInput): Promise<UserProfile | null> => {
      if (demo) {
        const next = {
          displayName: input.displayName.trim(),
          bio: input.bio.trim(),
          city: input.city.trim(),
          privacy: input.privacy,
        };
        await updateDemo(next);
        syncAccount({ displayName: next.displayName });
        return {
          id: account?.id ?? currentUser.id,
          username: account?.username ?? currentUser.username,
          displayName: next.displayName,
          bio: next.bio,
          city: next.city,
          countryCode: 'DO',
          avatarUrl: account?.avatarUrl ?? null,
          privacy: next.privacy,
          qrSlug: account?.username ?? currentUser.username,
          createdAt: '2024-01-01T00:00:00Z',
        };
      }

      if (!supabase || !account) {
        throw new Error('Inicia sesión para editar tu perfil.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: input.displayName.trim(),
          bio: input.bio.trim() || null,
          city: input.city.trim() || null,
          privacy: input.privacy,
        })
        .eq('id', account.id)
        .select(PROFILE_COLUMNS)
        .single();

      if (error) {
        throw new Error(
          error.code === '23505'
            ? 'Ese nombre de usuario ya está ocupado.'
            : 'No pudimos guardar tu perfil. Inténtalo de nuevo.',
        );
      }

      const profile = mapProfileRow(data as ProfileRow);
      syncAccount({
        displayName: profile.displayName,
        username: profile.username,
        avatarUrl: profile.avatarUrl ?? undefined,
      });
      return profile;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      void queryClient.invalidateQueries({ queryKey: ['public-profile'] });
      void queryClient.invalidateQueries({ queryKey: ['public-profile-vehicles'] });
    },
  });
}

function friendProfile(username: string): UserProfile | null {
  const friend = friends.find((item) => item.username === username);
  if (!friend) return null;

  return {
    id: friend.id,
    username: friend.username,
    displayName: friend.name,
    bio: 'Rutas de fin de semana, café y buenas curvas. Siempre en caravana.',
    city: 'Santo Domingo, RD',
    countryCode: 'DO',
    avatarUrl: null,
    privacy: 'public',
    qrSlug: friend.username,
    createdAt: '2023-01-01T00:00:00Z',
  };
}

export function usePublicProfile(username?: string) {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const demoProfile = useDemoProfile((state) => state.profile);
  const hydrateDemo = useDemoProfile((state) => state.hydrate);
  const handle = (username ?? '').replace('@', '');

  useEffect(() => {
    if (demo) void hydrateDemo();
  }, [demo, hydrateDemo]);

  const query = useQuery({
    queryKey: ['public-profile', handle, demo ? 'demo' : 'supabase'],
    enabled: Boolean(handle) && !demo,
    queryFn: async (): Promise<UserProfile | null> => {
      if (!handle || !supabase) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('username', handle)
        .maybeSingle<ProfileRow>();
      if (error) throw new Error(error.message);
      return data ? mapProfileRow(data) : null;
    },
  });

  let demoResult: UserProfile | null = null;
  if (demo) {
    if (handle === (account?.username ?? currentUser.username)) {
      demoResult = {
        id: account?.id ?? currentUser.id,
        username: handle,
        displayName: demoProfile.displayName,
        bio: demoProfile.bio,
        city: demoProfile.city,
        countryCode: 'DO',
        avatarUrl: account?.avatarUrl ?? null,
        privacy: demoProfile.privacy,
        qrSlug: handle,
        createdAt: '2024-01-01T00:00:00Z',
      };
    } else {
      demoResult = friendProfile(handle);
    }
  }

  return {
    profile: demo ? demoResult : query.data ?? null,
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    refetch: query.refetch,
    isDemo: demo,
  };
}

export function usePublicProfileVehicles(profileId?: string) {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  const query = useQuery({
    queryKey: ['public-profile-vehicles', profileId ?? 'none', demo ? 'demo' : 'supabase'],
    enabled: Boolean(profileId) && !demo,
    queryFn: async (): Promise<Vehicle[]> => {
      if (!profileId || !supabase) return [];
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('owner_id', profileId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as VehicleRow[]).map((row) => mapVehicleRow(row));
    },
  });

  if (demo) {
    const isMe =
      profileId === (account?.id ?? currentUser.id) ||
      profileId === currentUser.id;
    return { vehicles: isMe ? mockVehicles : [], isLoading: false, refetch: query.refetch };
  }

  return { vehicles: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch };
}
