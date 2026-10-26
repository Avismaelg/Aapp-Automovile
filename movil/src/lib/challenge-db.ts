import type {
  Challenge,
  ChallengeCategory,
  ChallengeParticipant,
  Friend,
  VehicleKind,
} from '@/src/data/mock';
import { profileColor, type UserProfile } from '@/src/lib/profile-db';

export type ChallengeMode = 'instant' | 'scheduled';
export type ChallengeStatus = 'pending' | 'live' | 'finished';
export type ParticipantStatus =
  | 'invited'
  | 'accepted'
  | 'declined'
  | 'finished'
  | 'cancelled';

export type ChallengeFriend = Friend & {
  vehicleId?: string;
};

export type RealChallengeParticipant = {
  userId: string;
  profile: UserProfile;
  vehicleId: string | null;
  vehicleKind: VehicleKind;
  vehicleLabel: string;
  status: ParticipantStatus;
  progressPct: number;
  elapsedSeconds: number;
  finishRank: number | null;
  isMe: boolean;
  isHost: boolean;
};

export type RealChallenge = {
  id: string;
  code: string;
  hostId: string;
  title: string;
  category: ChallengeCategory;
  status: ChallengeStatus | 'accepted' | 'declined' | 'cancelled';
  mode: ChallengeMode;
  fromLabel: string;
  toLabel: string;
  distanceM: number;
  startsAt: string | null;
  finishedAt: string | null;
  rules: string | null;
  createdAt: string;
  participants: RealChallengeParticipant[];
  myStatus: ParticipantStatus;
  isHost: boolean;
};

export function normalizeChallengeStatus(
  status: RealChallenge['status'],
): ChallengeStatus {
  if (status === 'live' || status === 'finished') return status;
  return 'pending';
}

export function realChallengeToChallenge(
  challenge: RealChallenge,
  now = Date.now(),
): Challenge {
  const distanceKm = Math.max(0, Math.round(challenge.distanceM / 100) / 10);
  const startedAt = challenge.startsAt ? new Date(challenge.startsAt).getTime() : 0;
  const elapsedSeconds =
    challenge.status === 'live' && startedAt > 0
      ? Math.max(0, Math.floor((now - startedAt) / 1000))
      : Math.max(
          0,
          ...challenge.participants.map((participant) => participant.elapsedSeconds),
        );

  const participants: ChallengeParticipant[] = challenge.participants
    .filter((participant) => participant.status !== 'declined' && participant.status !== 'cancelled')
    .sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      if (a.status !== b.status) {
        if (a.status === 'accepted') return -1;
        if (b.status === 'accepted') return 1;
      }
      if (a.finishRank && b.finishRank) return a.finishRank - b.finishRank;
      return b.progressPct - a.progressPct;
    })
    .map((participant) => ({
      id: participant.userId,
      name: participant.profile.displayName,
      username: participant.profile.username,
      color: profileColor(participant.profile.username),
      vehicleKind: participant.vehicleKind,
      vehicle: participant.vehicleLabel,
      progress: Math.round(participant.progressPct),
      etaMin: Math.max(1, Math.round(distanceKm * (1 - participant.progressPct / 100))),
      isMe: participant.isMe,
      rank: participant.finishRank ?? undefined,
    }));

  return {
    id: challenge.id,
    code: challenge.code,
    title: challenge.title,
    fromLabel: challenge.fromLabel,
    toLabel: challenge.toLabel,
    distanceKm,
    category: challenge.category,
    status: normalizeChallengeStatus(challenge.status),
    mode: challenge.mode,
    elapsedSeconds,
    participants,
    note: challenge.rules ?? undefined,
  };
}

export function emptyChallenge(): Challenge {
  return {
    id: 'empty',
    code: '—',
    title: 'Aún no hay un reto activo',
    fromLabel: 'Elige una ruta',
    toLabel: 'Invita a un piloto',
    distanceKm: 0,
    category: 'mixed',
    status: 'pending',
    mode: 'scheduled',
    elapsedSeconds: 0,
    participants: [],
    note: 'Crea un reto, invita a tus amigos y comparte la salida cuando todos estén listos.',
  };
}
