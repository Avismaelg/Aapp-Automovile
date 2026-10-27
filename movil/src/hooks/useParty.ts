import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';

import type { LiveLocation } from '@/src/hooks/useLiveLocation';
import type { PartyVoiceChannelSlug } from '@/src/lib/party';
import {
  mapProfileRow,
  PROFILE_COLUMNS,
  profileColor,
  type ProfileRow,
  type UserProfile,
} from '@/src/lib/profile-db';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';

export type PartyRole = 'host' | 'member' | 'sweeper';

export type PartyMemberView = {
  userId: string;
  profile: UserProfile;
  color: string;
  role: PartyRole;
  lastLat: number | null;
  lastLng: number | null;
  lastSeenAt: string | null;
  isMuted: boolean;
  isMe: boolean;
  voiceChannelSlug: PartyVoiceChannelSlug;
};

export type PartyView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  hostId: string;
  destinationLabel: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  startsAt: string | null;
  createdAt: string;
  maxMembers: number;
  voiceRoom: string;
  members: PartyMemberView[];
  isHost: boolean;
};

type PartyRow = {
  id: string;
  invite_code: string;
  name: string;
  description: string | null;
  status: PartyView['status'];
  host_id: string;
  destination_label: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  starts_at: string | null;
  created_at: string;
  max_members: number;
  voice_room: string;
};

type PartyMemberRow = {
  party_id: string;
  user_id: string;
  role: PartyRole;
  last_lat: number | null;
  last_lng: number | null;
  last_seen_at: string | null;
  is_muted: boolean;
  voice_channel_slug: PartyVoiceChannelSlug;
};

function demoMode(mode: string | undefined) {
  return mode === 'demo' || !isSupabaseConfigured || !supabase;
}

function fallbackProfile(id: string): UserProfile {
  return {
    id,
    username: 'piloto',
    displayName: 'Piloto',
    bio: '',
    city: '',
    countryCode: 'DO',
    avatarUrl: null,
    privacy: 'public',
    qrSlug: `piloto-${id.slice(0, 6)}`,
    createdAt: new Date().toISOString(),
  };
}

async function fetchParty(party: PartyRow, accountId: string): Promise<PartyView> {
  if (!supabase) throw new Error('Supabase no está configurado.');

  const { data: memberRows, error } = await supabase
    .from('party_members')
    .select('party_id, user_id, role, last_lat, last_lng, last_seen_at, is_muted, voice_channel_slug')
    .eq('party_id', party.id)
    .is('left_at', null);

  if (error) throw new Error(error.message);
  const members = (memberRows ?? []) as PartyMemberRow[];
  const userIds = members.map((member) => member.user_id);

  const { data: profileRows, error: profileError } = userIds.length
    ? await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', userIds)
    : { data: [], error: null };

  if (profileError) throw new Error(profileError.message);
  const profileMap = new Map(
    ((profileRows ?? []) as ProfileRow[]).map((row) => [row.id, mapProfileRow(row)]),
  );

  return {
    id: party.id,
    code: party.invite_code,
    name: party.name,
    description: party.description,
    status: party.status,
    hostId: party.host_id,
    destinationLabel: party.destination_label,
    destinationLat: party.destination_lat,
    destinationLng: party.destination_lng,
    startsAt: party.starts_at,
    createdAt: party.created_at,
    maxMembers: party.max_members,
    voiceRoom: party.voice_room,
    isHost: party.host_id === accountId,
    members: members.map((member) => {
      const profile = profileMap.get(member.user_id) ?? fallbackProfile(member.user_id);
      return {
        userId: member.user_id,
        profile,
        color: profileColor(profile.username),
        role: member.role,
        lastLat: member.last_lat,
        lastLng: member.last_lng,
        lastSeenAt: member.last_seen_at,
        isMuted: member.is_muted,
        isMe: member.user_id === accountId,
        voiceChannelSlug: member.voice_channel_slug,
      };
    }),
  };
}

export function useActiveParty() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);
  const channelId = useId().replace(/:/g, '');

  const query = useQuery({
    queryKey: ['party', account?.id ?? 'guest', demo ? 'demo' : 'supabase'],
    enabled: Boolean(account) && !demo,
    queryFn: async (): Promise<PartyView | null> => {
      if (!account || !supabase) return null;

      const { data: memberships, error: membershipError } = await supabase
        .from('party_members')
        .select('party_id')
        .eq('user_id', account.id)
        .is('left_at', null);

      if (membershipError) throw new Error(membershipError.message);
      const partyIds = [...new Set((memberships ?? []).map((row) => row.party_id as string))];
      if (partyIds.length === 0) return null;

      const { data: parties, error } = await supabase
        .from('parties')
        .select('*')
        .in('id', partyIds)
        .in('status', ['scheduled', 'live'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw new Error(error.message);
      const party = (parties ?? [])[0] as PartyRow | undefined;
      if (!party) return null;

      return fetchParty(party, account.id);
    },
  });

  useEffect(() => {
    if (demo || !supabase || !account) return;
    const client = supabase;
    const cacheKey = ['party', account.id, 'supabase'];

    // Refrescar toda la party en cada latido (cada 5 s por miembro) era caro.
    // Ahora los UPDATE parchean la caché y solo se recarga si cambia la
    // estructura (altas, bajas o cambio de party).
    const patchMembers = (row: Partial<PartyMemberRow>) => {
      if (!row.user_id) return;
      queryClient.setQueryData<PartyView | null>(cacheKey, (current) => {
        if (!current) return current;
        let found = false;
        const members = current.members.map((member) => {
          if (member.userId !== row.user_id) return member;
          found = true;
          return {
            ...member,
            lastLat: row.last_lat !== undefined ? row.last_lat : member.lastLat,
            lastLng: row.last_lng !== undefined ? row.last_lng : member.lastLng,
            lastSeenAt: row.last_seen_at !== undefined ? row.last_seen_at : member.lastSeenAt,
            isMuted: row.is_muted !== undefined ? row.is_muted : member.isMuted,
            voiceChannelSlug:
              row.voice_channel_slug !== undefined ? row.voice_channel_slug : member.voiceChannelSlug,
          };
        });
        return found ? { ...current, members } : current;
      });
    };

    const patchParty = (row: Partial<PartyRow>) => {
      queryClient.setQueryData<PartyView | null>(cacheKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          name: row.name ?? current.name,
          status: row.status ?? current.status,
          destinationLabel:
            row.destination_label !== undefined ? row.destination_label : current.destinationLabel,
          destinationLat:
            row.destination_lat !== undefined ? row.destination_lat : current.destinationLat,
          destinationLng:
            row.destination_lng !== undefined ? row.destination_lng : current.destinationLng,
        };
      });
    };

    const channel = client
      .channel(`party-live-${account.id}-${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parties' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            patchParty(payload.new as Partial<PartyRow>);
          } else {
            void queryClient.invalidateQueries({ queryKey: ['party'] });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_members' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            patchMembers(payload.new as Partial<PartyMemberRow>);
          } else {
            void queryClient.invalidateQueries({ queryKey: ['party'] });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [account, demo, queryClient, channelId]);

  return {
    party: demo ? null : query.data ?? null,
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    error: demo ? null : query.error,
    refetch: query.refetch,
    isDemo: demo,
  };
}

export function useCreateParty() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  return useMutation({
    mutationFn: async (input: {
      name: string;
      destinationLabel: string;
      destinationLat?: number;
      destinationLng?: number;
    }) => {
      if (demo) throw new Error('Las parties reales requieren una cuenta conectada.');
      if (!supabase || !account) throw new Error('Inicia sesión para crear una party.');

      const { data, error } = await supabase
        .from('parties')
        .insert({
          host_id: account.id,
          name: input.name.trim(),
          status: 'live',
          starts_at: new Date().toISOString(),
          destination_label: input.destinationLabel,
          destination_lat: input.destinationLat ?? null,
          destination_lng: input.destinationLng ?? null,
          max_members: 10,
          is_private: true,
        })
        .select('id, invite_code')
        .single();

      if (error) throw new Error('No pudimos crear la party. Inténtalo de nuevo.');

      const { error: memberError } = await supabase.from('party_members').insert({
        party_id: data.id,
        user_id: account.id,
        role: 'host',
        last_seen_at: new Date().toISOString(),
      });

      if (memberError) {
        await supabase.from('parties').delete().eq('id', data.id);
        throw new Error('No pudimos unirte como anfitrión de la party.');
      }

      return { id: data.id as string, code: data.invite_code as string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['party'] });
    },
  });
}

export function useJoinParty() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  return useMutation({
    mutationFn: async (code: string) => {
      if (demo) throw new Error('Unirse a una party real requiere una cuenta.');
      if (!supabase || !account) throw new Error('Inicia sesión para unirte a la party.');

      const { data, error } = await supabase.rpc('join_party', {
        p_code: code.trim().toUpperCase(),
      });

      if (error) {
        if (error.message.includes('party_not_found')) {
          throw new Error('No encontramos una party con ese código.');
        }
        if (error.message.includes('party_full')) {
          throw new Error('La party está llena.');
        }
        throw new Error('No pudimos unirnos a la party. Revisa el código.');
      }

      const party = Array.isArray(data) ? data[0] : data;
      return { id: party?.id as string, code: party?.invite_code as string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['party'] });
    },
  });
}

export function useLeaveParty() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  return useMutation({
    mutationFn: async ({ partyId, isHost }: { partyId: string; isHost: boolean }) => {
      if (demo) throw new Error('Salir de una party real requiere una cuenta.');
      if (!supabase || !account) throw new Error('Inicia sesión para salir de la party.');

      const now = new Date().toISOString();
      const { error } = await supabase
        .from('party_members')
        .update({ left_at: now, last_lat: null, last_lng: null })
        .eq('party_id', partyId)
        .eq('user_id', account.id);

      if (error) throw new Error('No pudimos salir de la party.');

      if (isHost) {
        await supabase
          .from('parties')
          .update({ status: 'ended', ends_at: now })
          .eq('id', partyId)
          .eq('host_id', account.id);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['party'] });
    },
  });
}

export function useSetVoiceChannel() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  return useMutation({
    mutationFn: async ({
      partyId,
      channelSlug,
    }: {
      partyId: string;
      channelSlug: PartyVoiceChannelSlug;
    }) => {
      if (demo) return;
      if (!supabase || !account) throw new Error('Inicia sesión para cambiar de canal.');

      const { error } = await supabase
        .from('party_members')
        .update({ voice_channel_slug: channelSlug })
        .eq('party_id', partyId)
        .eq('user_id', account.id);

      if (error) throw new Error('No pudimos cambiar el canal de voz.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['party'] });
    },
  });
}

export function useSetPartyDestination() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  return useMutation({
    mutationFn: async ({
      partyId,
      label,
      lat,
      lng,
    }: {
      partyId: string;
      label: string | null;
      lat: number | null;
      lng: number | null;
    }) => {
      if (demo) return;
      if (!supabase || !account) throw new Error('Inicia sesión para compartir la ruta.');

      const { error } = await supabase.rpc('set_party_destination', {
        p_party_id: partyId,
        p_label: label,
        p_lat: lat,
        p_lng: lng,
      });

      if (error) {
        if (error.message.includes('not_a_member')) {
          throw new Error('No perteneces a esta party.');
        }
        if (error.message.includes('party_not_found')) {
          throw new Error('La party ya no existe.');
        }
        throw new Error('No pudimos actualizar el destino de la caravana.');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['party'] });
    },
  });
}

export function usePartyLocation(
  partyId: string | undefined,
  location: LiveLocation,
  enabled: boolean,
) {
  const accountId = useAuth((state) => state.account?.id);
  const latestRef = useRef(location);

  useEffect(() => {
    latestRef.current = location;
  }, [location]);

  useEffect(() => {
    const client = supabase;
    if (!partyId || !enabled || !accountId || !client) return;

    // Evita escrituras redundantes: si el coche no se movió 5 m y la última
    // actualización fue hace menos de 30 s, no hace falta tocar Supabase.
    let lastPushAt = 0;
    let lastLat: number | null = null;
    let lastLng: number | null = null;

    const pushLocation = async (force: boolean) => {
      const { latitude, longitude } = latestRef.current;
      const now = Date.now();
      if (!force && lastLat != null && lastLng != null) {
        const meters = Math.hypot(
          (latitude - lastLat) * 111320,
          (longitude - lastLng) * 111320 * Math.cos((latitude * Math.PI) / 180),
        );
        if (meters < 5 && now - lastPushAt < 30_000) return;
      }
      lastPushAt = now;
      lastLat = latitude;
      lastLng = longitude;
      try {
        await client
          .from('party_members')
          .update({
            last_lat: latitude,
            last_lng: longitude,
            last_seen_at: new Date().toISOString(),
          })
          .eq('party_id', partyId)
          .eq('user_id', accountId);
      } catch {
        // La siguiente actualización reintenta; no bloqueamos el mapa.
      }
    };

    void pushLocation(true);
    const timer = setInterval(() => void pushLocation(false), 5_000);
    return () => clearInterval(timer);
  }, [partyId, enabled, accountId]);
}

export type PartyMessageView = {
  id: number;
  userId: string;
  profile: UserProfile;
  body: string;
  createdAt: string;
  isMe: boolean;
};

type PartyMessageRow = {
  id: number;
  party_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export function usePartyMessages(partyId: string | undefined) {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);
  const channelId = useId().replace(/:/g, '');

  const query = useQuery({
    queryKey: ['party-messages', partyId ?? 'none', demo ? 'demo' : 'supabase'],
    enabled: Boolean(partyId) && !demo,
    queryFn: async (): Promise<PartyMessageView[]> => {
      if (!partyId || !account || !supabase) return [];

      const { data, error } = await supabase
        .from('party_messages')
        .select('id, party_id, user_id, body, created_at')
        .eq('party_id', partyId)
        .order('created_at', { ascending: true })
        .limit(120);

      if (error) throw new Error(error.message);
      const messages = (data ?? []) as PartyMessageRow[];
      const userIds = [...new Set(messages.map((message) => message.user_id))];
      const { data: profileRows, error: profileError } = userIds.length
        ? await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', userIds)
        : { data: [], error: null };

      if (profileError) throw new Error(profileError.message);
      const profileMap = new Map(
        ((profileRows ?? []) as ProfileRow[]).map((row) => [row.id, mapProfileRow(row)]),
      );

      return messages.map((message) => ({
        id: message.id,
        userId: message.user_id,
        profile: profileMap.get(message.user_id) ?? fallbackProfile(message.user_id),
        body: message.body,
        createdAt: message.created_at,
        isMe: message.user_id === account.id,
      }));
    },
  });

  useEffect(() => {
    if (demo || !supabase || !partyId) return;
    const channel = supabase
      .channel(`party-chat-${partyId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'party_messages',
          filter: `party_id=eq.${partyId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['party-messages', partyId] });
        },
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [demo, partyId, queryClient, channelId]);

  return {
    messages: demo ? [] : query.data ?? [],
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    refetch: query.refetch,
    isDemo: demo,
  };
}

export function useSendPartyMessage() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  return useMutation({
    mutationFn: async ({ partyId, body }: { partyId: string; body: string }) => {
      if (demo) throw new Error('El chat real requiere una cuenta conectada.');
      if (!supabase || !account) throw new Error('Inicia sesión para enviar mensajes.');
      if (!body.trim()) throw new Error('Escribe un mensaje.');

      const { error } = await supabase.from('party_messages').insert({
        party_id: partyId,
        user_id: account.id,
        body: body.trim(),
      });

      if (error) throw new Error('No pudimos enviar el mensaje.');
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['party-messages', variables.partyId],
      });
    },
  });
}
