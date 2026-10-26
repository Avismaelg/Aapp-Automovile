export type ProfilePrivacy = 'public' | 'friends' | 'private';

export type UserProfile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  city: string;
  countryCode: string | null;
  avatarUrl: string | null;
  privacy: ProfilePrivacy;
  qrSlug: string;
  createdAt: string;
};

export const PROFILE_COLUMNS =
  'id, username, display_name, bio, city, country_code, avatar_url, privacy, qr_slug, created_at';

export type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  city: string | null;
  country_code: string | null;
  avatar_url: string | null;
  privacy: ProfilePrivacy;
  qr_slug: string;
  created_at: string;
};

export function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio ?? '',
    city: row.city ?? '',
    countryCode: row.country_code,
    avatarUrl: row.avatar_url,
    privacy: row.privacy ?? 'public',
    qrSlug: row.qr_slug,
    createdAt: row.created_at,
  };
}

export function privacyLabel(privacy: ProfilePrivacy) {
  switch (privacy) {
    case 'private':
      return 'Privado';
    case 'friends':
      return 'Amigos';
    default:
      return 'Público';
  }
}

export function profileColor(username: string) {
  const palette = ['#FF5A1F', '#4DE1FF', '#C9FF4D', '#B98CFF', '#FFB84D', '#6EF0B5'];
  const hash = [...username].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}
