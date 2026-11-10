import { PermissionsAndroid, Platform } from 'react-native';

import { t } from '@/src/i18n';

// Permiso del micrófono para el walkie-talkie del convoy. Se pide al entrar a
// la app (no al pulsar «hablar» por primera vez, que hacía perder el mensaje).
export async function ensureMicrophone() {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    if (await PermissionsAndroid.check(permission)) return true;
    const result = await PermissionsAndroid.request(permission, {
      title: t('Micrófono para el walkie-talkie'),
      message: t('Caravana usa el micrófono solo mientras mantienes pulsado el botón para hablar.'),
      buttonPositive: t('Permitir'),
      buttonNegative: t('Ahora no'),
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  // iOS: el sistema pregunta al abrir el micrófono por primera vez; se abre
  // y se cierra enseguida solo para que salga el aviso (texto en app.json).
  try {
    const { mediaDevices } = await import('@livekit/react-native-webrtc');
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
