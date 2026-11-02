import * as SecureStore from 'expo-secure-store';
import { router, type Href } from 'expo-router';
import { Alert, Platform } from 'react-native';

import { t } from '@/src/i18n';

// OTR-01 (Ley 172-13) y R-05: antes de que el sistema pida el permiso de
// ubicación, la app explica para qué la usa y pide el consentimiento. La
// respuesta afirmativa se recuerda; si se rechaza, el mapa usa la posición de
// demostración (Santo Domingo) y se vuelve a preguntar la próxima vez.

const CONSENT_KEY = 'caravana.location-consent';
let pending: Promise<boolean> | null = null;

export function hasLocationConsent() {
  if (Platform.OS === 'web') return true;
  try {
    return SecureStore.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

function saveConsent() {
  try {
    SecureStore.setItem(CONSENT_KEY, '1');
  } catch {
    // Sin almacenamiento seguro vale para esta sesión.
  }
}

export function askLocationConsent(): Promise<boolean> {
  if (hasLocationConsent()) return Promise.resolve(true);
  if (pending) return pending;
  pending = new Promise<boolean>((resolve) => {
    const finish = (granted: boolean) => {
      pending = null;
      if (granted) saveConsent();
      resolve(granted);
    };
    Alert.alert(
      t('Tu ubicación en Caravana'),
      t(
        'Usamos tu ubicación para mostrarte en el mapa, guiarte, registrar tus viajes y, solo dentro de una party activa, compartir tu posición con sus miembros. No la vendemos ni la publicamos en tu perfil.',
      ),
      [
        {
          text: t('Ver política'),
          onPress: () => {
            finish(false);
            router.push('/privacidad' as Href);
          },
        },
        { text: t('Ahora no'), style: 'cancel', onPress: () => finish(false) },
        { text: t('Acepto'), onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
  return pending;
}
