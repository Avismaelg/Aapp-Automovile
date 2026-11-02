import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';
import { AppState } from 'react-native';

import {
  applyMemberPatches,
  changesMembership,
  queueMemberPatch,
  type MemberPatch,
} from '@/src/lib/party-patch';
import { isDemoMode } from '@/src/lib/demo';
import type { PartyVoiceChannelSlug } from '@/src/lib/party';
import {
  mapProfileRow,
  PROFILE_COLUMNS,
  profileColor,
  type ProfileRow,
  type UserProfile,
} from '@/src/lib/profile-db';
import { filterString, partySubscriptions } from '@/src/lib/realtime-routing';
import { acquireSubscription, uniqueTopic } from '@/src/lib/shared-subscription';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';

export type PartyRole = 'host' | 'member' | 'sweeper';

// Cada cuánto se aplican las posiciones acumuladas de la party.
const MEMBER_FLUSH_MS = 1_000;

export type PartyMemberView = {
  userId: string;
  profile: UserProfile;
  color: string;
  role: PartyRole;
  lastLat: number | null;
  lastLng: number | null;
  lastSeenAt: string | null;
  speedKmh: number | null;
  heading: number | null;
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
  destinationSetBy: string | null;
  destinationSetAt: string | null;
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
  destination_set_by?: string | null;
  destination_set_at?: string | null;
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
  last_speed_kmh?: number | string | null;
  last_heading?: number | string | null;
  is_muted: boolean;
  voice_channel_slug: PartyVoiceChannelSlug;
  left_at?: string | null;
};

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
    .select('party_id, user_id, role, last_lat, last_lng, last_seen_at, last_speed_kmh, last_heading, is_muted, voice_channel_slug')
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
    destinationSetBy: party.destination_set_by ?? null,
    destinationSetAt: party.destination_set_at ?? null,
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
        speedKmh: member.last_speed_kmh != null ? Number(member.last_speed_kmh) : null,
        heading: member.last_heading != null ? Number(member.last_heading) : null,
        isMuted: member.is_muted,
        isMe: member.user_id === accountId,
        voiceChannelSlug: member.voice_channel_slug,
      };
    }),
  };
}

async function leaveOtherParties(accountId: string, keepPartyId: string | null) {
  if (!supabase) return;
  let query = supabase
    .from('party_members')
    .update({ left_at: new Date().toISOString(), last_lat: null, last_lng: null })
    .eq('user_id', accountId)
    .is('left_at', null);
  if (keepPartyId) query = query.neq('party_id', keepPartyId);
  await query;
}

// `poll`: solo la pantalla siempre montada (Inicio) relee cada 15 s; si lo
// hicieran todas, la party se pediría varias veces por intervalo.
export function useActiveParty({ poll = false }: { poll?: boolean } = {}) {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const channelId = useId().replace(/:/g, '');

  const query = useQuery({
    queryKey: ['party', account?.id ?? 'guest', demo ? 'demo' : 'supabase'],
    enabled: Boolean(account) && !demo,
    // Respaldo del tiempo real: si se corta (cobertura, segundo plano), el
    // destino y las posiciones llegan igual como mucho en 15 s.
    refetchInterval: (current) => (poll && current.state.data ? 15_000 : false),
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

  const partyId = query.data?.id ?? null;

  // Al volver a la app se pone al día al momento (el canal pudo cortarse).
  const refetchParty = query.refetch;
  useEffect(() => {
    if (demo || !poll) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchParty();
    });
    return () => subscription.remove();
  }, [demo, poll, refetchParty]);

  useEffect(() => {
    if (demo || !supabase || !account) return;
    const client = supabase;
    const accountId = account.id;
    // Un solo canal para todas las pantallas que usan la party.
    return acquireSubscription(`party:${accountId}:${partyId ?? 'none'}`, () => {
      const cacheKey = ['party', accountId, 'supabase'];

      // Los UPDATE parchean la caché y solo se recarga si cambia la estructura
      // (altas, bajas o cambio de party). Con parties grandes llegan decenas de
      // posiciones por segundo: se acumulan y se aplican juntas cada segundo,
      // con un solo repintado.
      const queue = new Map<string, MemberPatch>();
      const flush = () => {
        if (queue.size === 0) return;
        const pending = new Map(queue);
        queue.clear();
        queryClient.setQueryData<PartyView | null>(cacheKey, (current) => {
          if (!current) return current;
          const members = applyMemberPatches(current.members, pending);
          return members === current.members ? current : { ...current, members };
        });
      };
      const timer = setInterval(flush, MEMBER_FLUSH_MS);

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
            destinationSetBy:
              row.destination_set_by !== undefined ? row.destination_set_by : current.destinationSetBy,
            destinationSetAt:
              row.destination_set_at !== undefined ? row.destination_set_at : current.destinationSetAt,
          };
        });
      };

      const refetch = () => void queryClient.invalidateQueries({ queryKey: ['party'] });
      // Solo los cambios de TU party (antes llegaban los de todas las parties
      // del sistema a cada teléfono). Sin party, solo tus propias altas.
      // Reglas en src/lib/realtime-routing.ts (las mismas que la prueba de carga).
      const channel = client.channel(uniqueTopic(`party-live-${accountId}-${channelId}`));
      for (const subscription of partySubscriptions(accountId, partyId)) {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: subscription.table,
            filter: filterString(subscription),
          },
          (payload) => {
            if (payload.eventType !== 'UPDATE' || !partyId) {
              refetch();
            } else if (subscription.table === 'parties') {
              patchParty(payload.new as Partial<PartyRow>);
            } else {
              const row = payload.new as Partial<PartyMemberRow>;
              if (!row.user_id) return;
              const current = queryClient.getQueryData<PartyView | null>(cacheKey);
              if (!current || changesMembership(row as MemberPatch, current.members)) refetch();
              else queueMemberPatch(queue, row as MemberPatch);
            }
          },
        );
      }
      channel.subscribe();

      return () => {
        clearInterval(timer);
        flush();
        void client.removeChannel(channel);
      };
    });
  }, [account, demo, queryClient, channelId, partyId]);

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
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async (input: {
      name: string;
      destinationLabel: string;
      destinationLat?: number;
      destinationLng?: number;
    }) => {
      if (demo) throw new Error('Las parties reales requieren una cuenta conectada.');
      if (!supabase || !account) throw new Error('Inicia sesión para crear una party.');

      // Solo una party activa a la vez: crear una nueva te saca de la anterior.
      await leaveOtherParties(account.id, null);

      const { data, error } = await supabase
        .from('parties')
        .insert({
          host_id: account.id,
          name: input.name.trim(),
          status: 'live',
          starts_at: new Date().toISOString(),
          destination_label: input.destinationLabel || null,
          destination_lat: input.destinationLat ?? null,
          destination_lng: input.destinationLng ?? null,
          max_members: 50,
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
  const demo = isDemoMode(account?.mode);

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
      if (party?.id) await leaveOtherParties(account.id, party.id as string);
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
  const demo = isDemoMode(account?.mode);

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
  const demo = isDemoMode(account?.mode);

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
  const demo = isDemoMode(account?.mode);

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
  const demo = isDemoMode(account?.mode);
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
      .channel(uniqueTopic(`party-chat-${partyId}-${channelId}`))
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
  const demo = isDemoMode(account?.mode);

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
