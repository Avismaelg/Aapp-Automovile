import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';

import { useActiveParty, usePartyHostActions } from '@/src/hooks/useParty';
import { ALERTS_CHANNEL } from '@/src/lib/background-alerts';
import { newArrivals } from '@/src/lib/convoy';
import { t } from '@/src/i18n';

// CONV-06: cuando un miembro llega a la meta común, todos reciben un aviso
// discreto (notificación, sin cortar la navegación). Cuando han llegado
// todos, al anfitrión se le ofrece cerrar el convoy con el resumen.
export function ConvoyArrivals() {
  const router = useRouter();
  const { party } = useActiveParty();
  const hostActions = usePartyHostActions();
  const seenRef = useRef<{ partyId: string | null; arrived: Map<string, string | null> }>({
    partyId: null,
    arrived: new Map(),
  });
  const summaryShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!party) return;
    const seen = seenRef.current;
    const current = new Map(party.members.map((member) => [member.userId, member.arrivedAt]));
    // Al abrir (o cambiar de party) se toma lo que ya había: sin avisos viejos.
    if (seen.partyId !== party.id) {
      seenRef.current = { partyId: party.id, arrived: current };
      return;
    }
    const arrivals = newArrivals(seen.arrived, party.members);
    seen.arrived = current;
    for (const member of arrivals) {
      void Notifications.scheduleNotificationAsync({
        content: {
          title: t('{0} llegó a la meta', member.profile.displayName.split(' ')[0]),
          body: party.destinationLabel ?? t('Destino del convoy'),
          data: { url: '/party' },
        },
        trigger: Platform.OS === 'android' ? { channelId: ALERTS_CHANNEL } : null,
      }).catch(() => undefined);
    }

    const everyone = party.members.length > 1 && party.members.every((member) => member.arrivedAt);
    const key = `${party.id}:${party.destinationSetAt ?? ''}`;
    if (!everyone || !party.isHost || summaryShownRef.current === key) return;
    summaryShownRef.current = key;
    const startedAt = Date.parse(party.destinationSetAt ?? party.createdAt);
    const lines = [...party.members]
      .sort((a, b) => Date.parse(a.arrivedAt as string) - Date.parse(b.arrivedAt as string))
      .map((member, index) => {
        const minutes = Math.max(1, Math.round((Date.parse(member.arrivedAt as string) - startedAt) / 60_000));
        return `${index + 1}. ${member.isMe ? t('Tú') : member.profile.displayName} · ${t('{0} min', minutes)}`;
      });
    Alert.alert(t('Habéis llegado todos'), lines.join('\n'), [
      { text: t('Seguir en el convoy'), style: 'cancel' },
      {
        text: t('Cerrar el convoy'),
        onPress: () =>
          void hostActions.endForAll
            .mutateAsync({ partyId: party.id })
            .then(() => router.replace('/'))
            .catch(() => undefined),
      },
    ]);
  }, [party, hostActions.endForAll, router]);

  return null;
}
