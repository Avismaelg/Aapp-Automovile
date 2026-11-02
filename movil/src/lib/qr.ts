import { BRAND } from '@/src/brand';

export const WEB_BASE = process.env.EXPO_PUBLIC_WEB_URL || BRAND.webUrl;

export function profileUrl(username: string) {
  return `${WEB_BASE}/u/${encodeURIComponent(username)}`;
}

export function vehicleUrl(slug: string) {
  return `${WEB_BASE}/v/${encodeURIComponent(slug)}`;
}

// Página de invitación (GitHub Pages): muestra el código y abre la app.
export const INVITE_BASE =
  process.env.EXPO_PUBLIC_INVITE_URL || BRAND.inviteUrl;

export function partyUrl(code: string) {
  return `${INVITE_BASE}/p/?c=${encodeURIComponent(code.toUpperCase())}`;
}

export function challengeUrl(code: string) {
  return `${WEB_BASE}/challenge/${encodeURIComponent(code.toUpperCase())}`;
}

export type CaravanaLink =
  | { kind: 'profile'; id: string }
  | { kind: 'vehicle'; id: string }
  | { kind: 'party'; id: string }
  | { kind: 'challenge'; id: string };

export function parseCaravanaUrl(raw: string): CaravanaLink | null {
  let path = raw.trim();
  // Enlace de invitación de la página web: …/p/?c=ABC123
  const code = path.match(/\/p\/?\?(?:.*&)?c=([A-Za-z0-9]{4,8})/);
  if (code) return { kind: 'party', id: code[1].toUpperCase() };
  try {
    const url = new URL(path);
    path = url.pathname;
  } catch {
    // Puede ser un código corto o una ruta relativa.
  }

  const match = path.match(/\/(u|v|p|c|challenge)\/([A-Za-z0-9._-]+)/);
  if (!match) return null;

  const [, type, id] = match;
  if (type === 'u') return { kind: 'profile', id };
  if (type === 'v') return { kind: 'vehicle', id };
  if (type === 'c' || type === 'challenge') return { kind: 'challenge', id: id.toUpperCase() };
  return { kind: 'party', id: id.toUpperCase() };
}
