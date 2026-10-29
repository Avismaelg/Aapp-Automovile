import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  friends as mockFriends,
  type ChallengeCategory,
  type VehicleKind,
} from '@/src/data/mock';
import {
  realChallengeToChallenge,
  type ChallengeFriend,
  type ChallengeMode,
  type ParticipantStatus,
  type RealChallenge,
} from '@/src/lib/challenge-db';
import {
  mapProfileRow,
  PROFILE_COLUMNS,
  profileColor,
  type ProfileRow,
  type UserProfile,
} from '@/src/lib/profile-db';
import { isDemoMode } from '@/src/lib/demo';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { useFriends } from '@/src/hooks/useFriends';

type ChallengeRow = {
  id: string;
  code: string;
  host_id: string;
  title: string;
  category: ChallengeCategory;
  status: RealChallenge['status'];
  mode: ChallengeMode;
  from_label: string;
  to_label: string;
  distance_m: number;
  starts_at: string | null;
  finished_at: string | null;
  rules: string | null;
  created_at: string;
};

type ParticipantRow = {
  challenge_id: string;
  user_id: string;
  vehicle_id: string | null;
  vehicle_kind: VehicleKind;
  status: ParticipantStatus;
  progress_pct: number | string;
  elapsed_s: number;
  finish_rank: number | null;
};

type VehicleRow = {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  kind: VehicleKind;
  is_primary: boolean;
  created_at: string;
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

export function useChallengeFriends() {
  const friendData = useFriends();
  const demo = friendData.isDemo;
  const friendIds = friendData.friends.map((entry) => entry.profile.id);

  const vehiclesQuery = useQuery({
    queryKey: ['challenge-friend-vehicles', [...friendIds].sort().join(','), demo ? 'demo' : 'supabase'],
    enabled: !demo && friendIds.length > 0,
    queryFn: async (): Promise<VehicleRow[]> => {
      if (!supabase || friendIds.length === 0) return [];
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, owner_id, make, model, kind, is_primary, created_at')
        .in('owner_id', friendIds)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as VehicleRow[];
    },
  });

  if (demo) {
    return {
      friends: mockFriends as ChallengeFriend[],
      isLoading: false,
      isDemo: true,
      error: null,
    };
  }

  const vehicleByOwner = new Map<string, VehicleRow>();
  for (const vehicle of vehiclesQuery.data ?? []) {
    if (!vehicleByOwner.has(vehicle.owner_id)) {
      vehicleByOwner.set(vehicle.owner_id, vehicle);
    }
  }

  const friends: ChallengeFriend[] = friendData.friends.flatMap((entry) => {
    const vehicle = vehicleByOwner.get(entry.profile.id);
    if (!vehicle) return [];
    return [
      {
        id: entry.profile.id,
        name: entry.profile.displayName,
        username: entry.profile.username,
        color: profileColor(entry.profile.username),
        car: `${vehicle.make} ${vehicle.model}`,
        vehicleKind: vehicle.kind,
        vehicleId: vehicle.id,
        online: false,
        status: 'Disponible',
      },
    ];
  });

  return {
    friends,
    isLoading: friendData.isLoading || vehiclesQuery.isLoading,
    isDemo: false,
    error: friendData.error ?? vehiclesQuery.error,
  };
}

export function useChallenges() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  const query = useQuery({
    queryKey: ['challenges', account?.id ?? 'guest', demo ? 'demo' : 'supabase'],
    enabled: Boolean(account) && !demo,
    queryFn: async (): Promise<RealChallenge[]> => {
      if (!account || !supabase) return [];

      const { data: challengeRows, error } = await supabase
        .from('challenges')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) throw new Error(error.message);
      const challenges = (challengeRows ?? []) as ChallengeRow[];
      if (challenges.length === 0) return [];

      const challengeIds = challenges.map((challenge) => challenge.id);
      const { data: participantRows, error: participantError } = await supabase
        .from('challenge_participants')
        .select('*')
        .in('challenge_id', challengeIds);

      if (participantError) throw new Error(participantError.message);
      const participants = (participantRows ?? []) as ParticipantRow[];

      const profileIds = [
        ...new Set([
          ...challenges.map((challenge) => challenge.host_id),
          ...participants.map((participant) => participant.user_id),
        ]),
      ];
      const vehicleIds = [
        ...new Set(
          participants
            .map((participant) => participant.vehicle_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const [profilesResult, vehiclesResult] = await Promise.all([
        supabase.from('profiles').select(PROFILE_COLUMNS).in('id', profileIds),
        vehicleIds.length
          ? supabase.from('vehicles').select('id, make, model, kind').in('id', vehicleIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (profilesResult.error) throw new Error(profilesResult.error.message);
      if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);

      const profileMap = new Map(
        ((profilesResult.data ?? []) as ProfileRow[]).map((row) => [
          row.id,
          mapProfileRow(row),
        ]),
      );
      const vehicleMap = new Map(
        ((vehiclesResult.data ?? []) as { id: string; make: string; model: string; kind: VehicleKind }[]).map(
          (vehicle) => [vehicle.id, vehicle],
        ),
      );

      return challenges.map((challenge) => {
        const challengeParticipants = participants.filter(
          (participant) => participant.challenge_id === challenge.id,
        );
        const mine = challengeParticipants.find(
          (participant) => participant.user_id === account.id,
        );
        const isHost = challenge.host_id === account.id;

        return {
          id: challenge.id,
          code: challenge.code,
          hostId: challenge.host_id,
          title: challenge.title,
          category: challenge.category,
          status: challenge.status,
          mode: challenge.mode,
          fromLabel: challenge.from_label,
          toLabel: challenge.to_label,
          distanceM: challenge.distance_m,
          startsAt: challenge.starts_at,
          finishedAt: challenge.finished_at,
          rules: challenge.rules,
          createdAt: challenge.created_at,
          isHost,
          myStatus: mine?.status ?? (isHost ? 'accepted' : 'invited'),
          participants: challengeParticipants.map((participant) => {
            const vehicle = participant.vehicle_id
              ? vehicleMap.get(participant.vehicle_id)
              : undefined;
            return {
              userId: participant.user_id,
              profile: profileMap.get(participant.user_id) ?? fallbackProfile(participant.user_id),
              vehicleId: participant.vehicle_id,
              vehicleKind: participant.vehicle_kind,
              vehicleLabel: vehicle
                ? `${vehicle.make} ${vehicle.model}`
                : participant.vehicle_id
                  ? 'Vehículo privado'
                  : 'Sin vehículo',
              status: participant.status,
              progressPct: Number(participant.progress_pct),
              elapsedSeconds: participant.elapsed_s,
              finishRank: participant.finish_rank,
              isMe: participant.user_id === account.id,
              isHost: participant.user_id === challenge.host_id,
            };
          }),
        };
      });
    },
  });

  useEffect(() => {
    if (demo || !supabase || !account) return;
    const channel = supabase
      .channel(`challenges-live-${account.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenges' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['challenges'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenge_participants' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['challenges'] });
        },
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [account, demo, queryClient]);

  const challenges = demo ? [] : query.data ?? [];
  const visible = challenges.filter((challenge) => challenge.myStatus !== 'declined');
  const live = visible.find((challenge) => challenge.status === 'live') ?? null;
  const incomingInvites = visible.filter(
    (challenge) =>
      challenge.status === 'pending' &&
      !challenge.isHost &&
      challenge.myStatus === 'invited',
  );
  const pending = visible.filter(
    (challenge) => challenge.status === 'pending' && challenge.myStatus !== 'declined',
  );
  const history = visible.filter((challenge) => challenge.status === 'finished');
  const active = live ?? incomingInvites[0] ?? pending[0] ?? history[0] ?? null;

  return {
    challenges,
    active,
    activeAsChallenge: active ? realChallengeToChallenge(active) : null,
    invitations: incomingInvites,
    history,
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    error: demo ? null : query.error,
    refetch: query.refetch,
    isDemo: demo,
  };
}

export type CreateChallengeInput = {
  title: string;
  category: ChallengeCategory;
  mode: ChallengeMode;
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  rules: string;
  hostVehicleId?: string;
  hostVehicleKind: VehicleKind;
  invitees: {
    userId: string;
    vehicleId?: string;
    vehicleKind: VehicleKind;
  }[];
};

export function useCreateChallenge() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async (input: CreateChallengeInput) => {
      if (demo) {
        throw new Error('Los retos reales requieren una cuenta conectada.');
      }
      if (!supabase || !account) {
        throw new Error('Inicia sesión para crear un reto.');
      }
      if (input.invitees.length === 0) {
        throw new Error('Invita al menos a otro piloto.');
      }

      const { data, error } = await supabase
        .from('challenges')
        .insert({
          host_id: account.id,
          title: input.title,
          category: input.category,
          status: input.mode === 'instant' ? 'live' : 'pending',
          mode: input.mode,
          from_label: input.fromLabel,
          to_label: input.toLabel,
          distance_m: Math.round(input.distanceKm * 1000),
          starts_at: input.mode === 'instant' ? new Date().toISOString() : null,
          rules: input.rules,
        })
        .select('id, code')
        .single();

      if (error) {
        throw new Error('No pudimos crear el reto. Inténtalo de nuevo.');
      }

      const challengeId = data.id as string;
      const participants = [
        {
          challenge_id: challengeId,
          user_id: account.id,
          vehicle_id: input.hostVehicleId ?? null,
          vehicle_kind: input.hostVehicleKind,
          status: 'accepted' as const,
        },
        ...input.invitees.map((invitee) => ({
          challenge_id: challengeId,
          user_id: invitee.userId,
          vehicle_id: invitee.vehicleId ?? null,
          vehicle_kind: invitee.vehicleKind,
          status: 'invited' as const,
        })),
      ];

      const { error: participantError } = await supabase
        .from('challenge_participants')
        .insert(participants);

      if (participantError) {
        await supabase.from('challenges').delete().eq('id', challengeId);
        throw new Error('No pudimos invitar a los pilotos. Inténtalo de nuevo.');
      }

      return { id: challengeId, code: data.code as string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });
}

export function useRespondChallenge() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async ({
      challengeId,
      accept,
    }: {
      challengeId: string;
      accept: boolean;
    }) => {
      if (demo) throw new Error('Los retos reales requieren una cuenta conectada.');
      if (!supabase || !account) throw new Error('Inicia sesión para responder el reto.');

      const { error } = await supabase
        .from('challenge_participants')
        .update({ status: accept ? 'accepted' : 'declined' })
        .eq('challenge_id', challengeId)
        .eq('user_id', account.id);

      if (error) throw new Error('No pudimos responder la invitación.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });
}

export function useStartChallenge() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async (challengeId: string) => {
      if (demo) throw new Error('Los retos reales requieren una cuenta conectada.');
      if (!supabase || !account) throw new Error('Inicia sesión para iniciar el reto.');

      const { error } = await supabase
        .from('challenges')
        .update({ status: 'live', starts_at: new Date().toISOString() })
        .eq('id', challengeId)
        .eq('host_id', account.id);

      if (error) throw new Error('No pudimos iniciar el reto.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });
}

export function useFinishChallenge() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async (challengeId: string) => {
      if (demo) throw new Error('Los retos reales requieren una cuenta conectada.');
      if (!supabase || !account) throw new Error('Inicia sesión para finalizar el reto.');

      const now = new Date().toISOString();
      const { error } = await supabase
        .from('challenges')
        .update({ status: 'finished', finished_at: now })
        .eq('id', challengeId)
        .eq('host_id', account.id);

      if (error) throw new Error('No pudimos finalizar el reto.');

      await supabase
        .from('challenge_participants')
        .update({ status: 'finished', finished_at: now })
        .eq('challenge_id', challengeId)
        .eq('status', 'accepted');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });
}
