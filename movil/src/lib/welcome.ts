import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { IntroGreeting } from '@/src/components/intro/GalaxyIntro';
import { formatDistance, t } from '@/src/i18n';

// Saludo de la intro: según la hora, tu nombre y lo que te espera hoy.

const WELCOMED_KEY = 'caravana.welcomed';

export function partOfDay(hour: number) {
  if (hour >= 5 && hour < 12) return t('Buenos días');
  if (hour >= 12 && hour < 19) return t('Buenas tardes');
  return t('Buenas noches');
}

export function buildGreeting({
  name,
  hour,
  firstTime,
  partyName,
  vehicleName,
  friendsOnMap,
  totalDistanceM,
}: {
  name: string;
  hour: number;
  firstTime: boolean;
  partyName?: string | null;
  vehicleName?: string | null;
  friendsOnMap: number;
  totalDistanceM: number;
}): IntroGreeting {
  const firstName = name.trim().split(/\s+/)[0] ?? '';
  const subtitle = partyName
    ? t('Tu party «{0}» te espera.', partyName)
    : vehicleName
      ? t('Tu {0} está listo para rodar.', vehicleName)
      : t('¿A dónde vamos hoy?');
  const chips: string[] = [];
  if (friendsOnMap === 1) chips.push(t('1 amigo en el mapa'));
  else if (friendsOnMap > 1) chips.push(t('{0} amigos en el mapa', friendsOnMap));
  if (totalDistanceM >= 1000) chips.push(t('{0} recorridos', formatDistance(totalDistanceM)));
  return {
    eyebrow: firstTime ? t('TE DAMOS LA BIENVENIDA') : t('QUÉ BUENO VERTE'),
    title: firstName ? `${partOfDay(hour)}, ${firstName}` : partOfDay(hour),
    subtitle,
    chips,
  };
}

// Primera vez que se abre la app en este teléfono (y la marca como vista).
export function takeFirstWelcome() {
  if (Platform.OS === 'web') return false;
  try {
    if (SecureStore.getItem(WELCOMED_KEY)) return false;
    SecureStore.setItem(WELCOMED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
