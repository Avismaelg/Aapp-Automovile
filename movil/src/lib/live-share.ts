import AsyncStorage from '@react-native-async-storage/async-storage';

import { shouldPushLive, type LiveFix } from '@/src/lib/convoy';
import { shouldPushFriendLocation } from '@/src/lib/party-invites';
import { supabase } from '@/src/lib/supabase';

// Sube tu posición a la party y a tus amigos. Lo llaman la pantalla del mapa
// (app abierta) y la tarea de ubicación en segundo plano (pantalla bloqueada):
// antes solo se subía con el mapa abierto y, al bloquear el móvil, los demás
// te veían congelado. El ritmo es común a las dos fuentes, así que nunca se
// sube dos veces la misma posición.

const KEY = 'caravana-live-share';

type Config = { accountId: string | null; partyId: string | null; friends: boolean };

let config: Config | null = null;

// CONV-04: progreso hacia la meta común (la pantalla de navegación lo
// actualiza; viaja con cada posición). null = no vas hacia la meta.
type Progress = { etaS: number; remainingM: number; arrived: boolean; at: number };
let progress: Progress | null = null;
let arrivedSent = false;
const PROGRESS_FRESH_MS = 60_000;

export function setConvoyProgress(next: Omit<Progress, 'at'> | null) {
  progress = next ? { ...next, at: Date.now() } : null;
  if (!next || !next.arrived) arrivedSent = false;
}
let lastParty: LiveFix | null = null;
let lastFriends: { lat: number; lng: number; at: number } | null = null;
let busy = false;

async function getConfig(): Promise<Config> {
  if (config) return config;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    config = raw ? (JSON.parse(raw) as Config) : { accountId: null, partyId: null, friends: false };
  } catch {
    config = { accountId: null, partyId: null, friends: false };
  }
  return config;
}

// La app la mantiene al día (cuenta, party activa y si compartes con amigos)
// para que la tarea en segundo plano sepa a dónde subir sin abrir pantallas.
export async function setLiveShareConfig(next: Partial<Config>) {
  const current = await getConfig();
  const merged = { ...current, ...next };
  if (merged.partyId !== current.partyId) lastParty = null;
  if (merged.friends !== current.friends) lastFriends = null;
  config = merged;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Sin almacenamiento sigue valiendo la copia en memoria.
  }
}

// Cuenta con sesión (para los avisos en segundo plano).
export async function getLiveShareAccount() {
  return (await getConfig()).accountId;
}

function progressColumns(seenAt: string) {
  if (!progress || Date.now() - progress.at > PROGRESS_FRESH_MS) return {};
  const columns: Record<string, unknown> = {
    eta_s: Math.max(0, Math.round(progress.etaS)),
    remaining_m: Math.max(0, Math.round(progress.remainingM)),
    progress_at: seenAt,
  };
  if (progress.arrived && !arrivedSent) {
    columns.arrived_at = seenAt;
    arrivedSent = true;
  }
  return columns;
}

export async function pushLivePosition(fix: LiveFix) {
  const client = supabase;
  if (!client || busy) return;
  const { accountId, partyId, friends } = await getConfig();
  if (!accountId) return;
  const toParty = Boolean(partyId) && shouldPushLive(lastParty, fix);
  const friendFix = { lat: fix.latitude, lng: fix.longitude, at: fix.at };
  const toFriends = friends && shouldPushFriendLocation(lastFriends, friendFix);
  if (!toParty && !toFriends) return;

  busy = true;
  const seenAt = new Date(fix.at).toISOString();
  try {
    // Con la pantalla bloqueada no corre la renovación automática de la
    // sesión: caducaba a la hora y las posiciones dejaban de subirse (los
    // demás te veían congelado). getSession la renueva si hace falta.
    await client.auth.getSession();
    const writes: PromiseLike<unknown>[] = [];
    if (toParty && partyId) {
      lastParty = fix;
      writes.push(
        client
          .from('party_members')
          .update({
            last_lat: fix.latitude,
            last_lng: fix.longitude,
            last_speed_kmh: fix.speedKmh != null ? Math.round(fix.speedKmh * 10) / 10 : null,
            last_heading: fix.heading != null ? Math.round(fix.heading) % 360 : null,
            last_seen_at: seenAt,
            ...progressColumns(seenAt),
          })
          .eq('party_id', partyId)
          .eq('user_id', accountId)
          .then(({ error }) => {
            if (error) lastParty = null;
          }),
      );
    }
    if (toFriends) {
      lastFriends = friendFix;
      writes.push(
        client
          .from('friend_locations')
          .upsert({
            user_id: accountId,
            lat: fix.latitude,
            lng: fix.longitude,
            heading: fix.heading,
            speed_kmh: fix.speedKmh,
            updated_at: seenAt,
          })
          .then(({ error }) => {
            if (error) lastFriends = null;
          }),
      );
    }
    await Promise.all(writes);
  } catch {
    // Sin conexión: la siguiente posición lo reintenta.
    lastParty = null;
    lastFriends = null;
  } finally {
    busy = false;
  }
}

