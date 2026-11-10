import type {
  Challenge,
  ChallengeCategory,
  ChallengeParticipant,
  Friend,
  VehicleKind,
} from '@/src/types/models';
import { compareRacers, ETA_FRESH_MS } from '@/src/lib/convoy';
import { profileColor, type UserProfile } from '@/src/lib/profile-db';
import { t } from '@/src/i18n';

export type ChallengeMode = 'instant' | 'scheduled';
export type ChallengeStatus = 'pending' | 'live' | 'finished';
export type ParticipantStatus =
  | 'invited'
  | 'accepted'
  | 'declined'
  | 'finished'
  | 'cancelled'
  | 'abandoned';

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
  arrivalVerified?: boolean | null;
  // RETO-05: segundos que le faltan y cuándo se informó.
  etaS?: number | null;
  etaAt?: string | null;
  isMe: boolean;
  isHost: boolean;
  // RETO-07: último avance recibido (para «sin conexión»).
  lastProgressAt?: string | null;
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
  endLat: number | null;
  endLng: number | null;
  participants: RealChallengeParticipant[];
  myStatus: ParticipantStatus;
  isHost: boolean;
};

// RETO-07: sin avances en este tiempo durante el reto → «sin conexión».
export const CHALLENGE_OFFLINE_MS = 2 * 60_000;

// RETO-04: segundos que faltan para la salida (cuenta atrás); 0 si ya salió.
export function countdownSeconds(startsAt: string | null, now: number) {
  if (!startsAt) return 0;
  const at = Date.parse(startsAt);
  return Number.isFinite(at) && at > now ? Math.ceil((at - now) / 1000) : 0;
}

export function participantState(
  challenge: Pick<RealChallenge, 'status' | 'startsAt'>,
  participant: Pick<RealChallengeParticipant, 'status' | 'isMe' | 'lastProgressAt'>,
  now: number,
): 'racing' | 'finished' | 'abandoned' | 'offline' | 'waiting' {
  if (participant.status === 'abandoned') return 'abandoned';
  if (participant.status === 'finished') return 'finished';
  if (challenge.status !== 'live' || participant.status !== 'accepted') return 'waiting';
  if (participant.isMe) return 'racing';
  const started = challenge.startsAt ? Date.parse(challenge.startsAt) : now;
  const last = participant.lastProgressAt ? Date.parse(participant.lastProgressAt) : started;
  return now - Math.max(last, started) > CHALLENGE_OFFLINE_MS ? 'offline' : 'racing';
}

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
      return compareRacers(a, b, now);
    })
    .map((participant) => ({
      id: participant.userId,
      name: participant.profile.displayName,
      username: participant.profile.username,
      color: profileColor(participant.profile.username),
      vehicleKind: participant.vehicleKind,
      vehicle: participant.vehicleLabel,
      progress: Math.round(participant.progressPct),
      etaMin:
        participant.etaS != null && participant.etaAt != null && now - Date.parse(participant.etaAt) <= ETA_FRESH_MS
          ? Math.max(1, Math.round(participant.etaS / 60))
          : Math.max(1, Math.round(distanceKm * (1 - participant.progressPct / 100))),
      isMe: participant.isMe,
      rank: participant.finishRank ?? undefined,
      arrivalVerified: participant.arrivalVerified ?? null,
      state: participantState(challenge, participant, now),
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
    startsAt: challenge.status === 'live' ? challenge.startsAt : null,
  };
}

export function emptyChallenge(): Challenge {
  return {
    id: 'empty',
    code: '—',
    title: t('Aún no hay un reto activo'),
    fromLabel: t('Elige una ruta'),
    toLabel: t('Invita a un piloto'),
    distanceKm: 0,
    category: 'mixed',
    status: 'pending',
    mode: 'scheduled',
    elapsedSeconds: 0,
    participants: [],
    note: t('Crea un reto, invita a tus amigos y comparte la salida cuando todos estén listos.'),
  };
}
