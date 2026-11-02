import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { getLiveShareAccount } from '@/src/lib/live-share';
import { supabase } from '@/src/lib/supabase';

// Avisos con la app cerrada: invitaciones a una party, retos y cambios de
// destino del convoy. Sin servidor de notificaciones push (haría falta
// Firebase): los comprueba el servicio de ubicación, que sigue vivo en segundo
// plano, una vez por minuto, y los muestra como notificación del teléfono.

const CHECK_EVERY_MS = 60_000;
const SEEN_KEY = 'caravana-alerts-seen';
const MAX_SEEN = 150;
const CHANNEL = 'convoy';

let lastCheck = 0;
let running = false;

export type PendingAlert = { id: string; title: string; body: string; url: string };

type InviteRow = { id: string; party_name: string; inviter_id: string; created_at: string };
type ChallengeInviteRow = { challenge_id: string; status: string };
type ChallengeRow = { id: string; title: string; to_label: string; host_id: string };
type PartyRow = {
  id: string;
  destination_label: string | null;
  destination_set_by: string | null;
  destination_set_at: string | null;
};

async function seenIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// Qué avisar: lo nuevo que no se ha avisado ya. Sin React ni red: lo prueban
// los tests.
export function alertsToShow(
  candidates: PendingAlert[],
  seen: string[],
): { show: PendingAlert[]; seen: string[] } {
  const known = new Set(seen);
  const show = candidates.filter((alert) => !known.has(alert.id));
  const next = [...seen, ...show.map((alert) => alert.id)].slice(-MAX_SEEN);
  return { show, seen: next };
}

async function names(ids: string[]) {
  if (!supabase || ids.length === 0) return new Map<string, string>();
  const { data } = await supabase.from('profiles').select('id, display_name').in('id', ids);
  return new Map(
    ((data ?? []) as { id: string; display_name: string }[]).map((row) => [
      row.id,
      row.display_name.split(' ')[0],
    ]),
  );
}

async function collect(accountId: string): Promise<PendingAlert[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [invites, challengeInvites, memberships] = await Promise.all([
    supabase
      .from('party_invites')
      .select('id, party_name, inviter_id, created_at')
      .eq('invitee_id', accountId)
      .eq('status', 'pending')
      .gte('created_at', since)
      .limit(5),
    supabase
      .from('challenge_participants')
      .select('challenge_id, status')
      .eq('user_id', accountId)
      .eq('status', 'invited')
      .limit(5),
    supabase.from('party_members').select('party_id').eq('user_id', accountId).is('left_at', null).limit(1),
  ]);

  const inviteRows = (invites.data ?? []) as InviteRow[];
  const challengeIds = ((challengeInvites.data ?? []) as ChallengeInviteRow[]).map((row) => row.challenge_id);
  const partyId = (memberships.data?.[0] as { party_id: string } | undefined)?.party_id;

  const [challenges, party] = await Promise.all([
    challengeIds.length
      ? supabase.from('challenges').select('id, title, to_label, host_id').in('id', challengeIds)
      : Promise.resolve({ data: [] }),
    partyId
      ? supabase
          .from('parties')
          .select('id, destination_label, destination_set_by, destination_set_at')
          .eq('id', partyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const challengeRows = (challenges.data ?? []) as ChallengeRow[];
  const partyRow = party.data as PartyRow | null;

  const who = await names([
    ...inviteRows.map((row) => row.inviter_id),
    ...challengeRows.map((row) => row.host_id),
    ...(partyRow?.destination_set_by ? [partyRow.destination_set_by] : []),
  ]);

  const alerts: PendingAlert[] = [];
  for (const row of inviteRows) {
    alerts.push({
      id: `invite:${row.id}:${row.created_at}`,
      title: `${who.get(row.inviter_id) ?? 'Un amigo'} te invita a su convoy`,
      body: `${row.party_name} · Toca para unirte`,
      url: '/(tabs)/party',
    });
  }
  for (const row of challengeRows) {
    alerts.push({
      id: `challenge:${row.id}`,
      title: `${who.get(row.host_id) ?? 'Un piloto'} te reta`,
      body: `Llegar primero a ${row.to_label}`,
      url: '/(tabs)/challenges',
    });
  }
  if (
    partyRow?.destination_set_at &&
    partyRow.destination_set_by &&
    partyRow.destination_set_by !== accountId &&
    Date.now() - Date.parse(partyRow.destination_set_at) < 30 * 60 * 1000
  ) {
    alerts.push({
      id: `destination:${partyRow.id}:${partyRow.destination_set_at}`,
      title: `${who.get(partyRow.destination_set_by) ?? 'El convoy'} cambió el destino`,
      body: `${partyRow.destination_label ?? 'Nuevo destino'} · Toca para ir con el convoy`,
      url: '/(tabs)',
    });
  }
  return alerts;
}

// La llama la tarea de ubicación en cada lote (como mucho, una vez por
// minuto). Con la app abierta no avisa: ya lo muestran los avisos en pantalla.
export async function checkBackgroundAlerts(now = Date.now()) {
  if (Platform.OS === 'web' || running || now - lastCheck < CHECK_EVERY_MS) return;
  if (AppState.currentState === 'active') return;
  lastCheck = now;
  running = true;
  try {
    const accountId = await getLiveShareAccount();
    if (!accountId) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    const candidates = await collect(accountId);
    const { show, seen } = alertsToShow(candidates, await seenIds());
    if (show.length === 0) return;
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    for (const alert of show) {
      await Notifications.scheduleNotificationAsync({
        content: { title: alert.title, body: alert.body, data: { url: alert.url } },
        trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
      });
    }
  } catch {
    // Sin red o sin sesión: se reintenta en el próximo minuto.
  } finally {
    running = false;
  }
}

// Con la app abierta: canal de Android y permiso (se pide una sola vez). Lo
// ya visto en pantalla se marca para no avisarlo luego.
export async function setupAlerts() {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Convoy y retos',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
}

export async function markAlertsSeen(ids: string[]) {
  const { seen } = alertsToShow(
    ids.map((id) => ({ id, title: '', body: '', url: '' })),
    await seenIds(),
  );
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen)).catch(() => {});
}

// Simulador: un aviso de prueba a los 8 s (para cerrar la app y verlo
// llegar). Mismo canal y misma apertura al tocarlo que los de verdad.
export async function showTestAlert() {
  await setupAlerts();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Laura te invita a su convoy',
      body: 'Aviso de prueba · Toca para abrir la pestaña Party',
      data: { url: '/(tabs)/party' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 8,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
    },
  });
}
