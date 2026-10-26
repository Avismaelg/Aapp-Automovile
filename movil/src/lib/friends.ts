import type { UserProfile } from '@/src/lib/profile-db';

export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'blocked';
export type FriendshipDirection = 'incoming' | 'outgoing' | 'friends';

export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
};

export type FriendEntry = {
  id: string;
  profile: UserProfile;
  status: FriendshipStatus;
  direction: FriendshipDirection;
  createdAt: string;
};

export type FriendRelation =
  | 'none'
  | 'friends'
  | 'incoming'
  | 'outgoing'
  | 'declined'
  | 'blocked';

export function relationForTarget(
  entries: FriendEntry[],
  targetId: string,
): FriendRelation {
  const entry = entries.find((item) => item.profile.id === targetId);
  if (!entry) return 'none';
  if (entry.status === 'accepted') return 'friends';
  if (entry.status === 'pending') {
    return entry.direction === 'incoming' ? 'incoming' : 'outgoing';
  }
  return entry.status;
}
