import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/src/lib/supabase';

// MAPA-24: registra el token de avisos de este teléfono (FCM en Android,
// APNs en iOS) para recibir invitaciones a convoys, retos y solicitudes de
// amistad con la app cerrada. Lo envía la Edge Function «push».

let registered: { accountId: string; token: string } | null = null;

export async function registerPushToken(accountId: string) {
  if (Platform.OS === 'web' || !supabase) return;
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return;
    if (registered?.accountId === accountId && registered.token === token) return;
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (!error) registered = { accountId, token };
  } catch {
    // Sin Firebase configurado o sin red: se reintenta al volver a la app.
  }
}

// Al cerrar sesión este teléfono deja de recibir los avisos de esa cuenta.
export async function unregisterPushToken() {
  const current = registered;
  registered = null;
  if (!current || !supabase) return;
  await supabase.from('push_tokens').delete().eq('token', current.token).then(
    () => undefined,
    () => undefined,
  );
}
