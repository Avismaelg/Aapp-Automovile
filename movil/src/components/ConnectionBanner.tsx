import { Ionicons } from '@expo/vector-icons';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

// SYNC-09: aviso discreto de conexión. «Sin conexión» mientras no hay red y
// «Conectado» un instante al volver (los datos se recargan solos).
const RECONNECTED_MS = 2_500;

// online: estado actual; back: acaba de volver la red (se muestra un momento).
function useConnectionState() {
  const [state, setState] = useState({ online: onlineManager.isOnline(), back: false });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onlineManager.subscribe((online) => {
      if (timer) clearTimeout(timer);
      setState((previous) => ({ online, back: online && !previous.online }));
      if (online) timer = setTimeout(() => setState({ online: true, back: false }), RECONNECTED_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);
  return state;
}

export function ConnectionBanner() {
  const { online, back: showBack } = useConnectionState();
  const insets = useSafeAreaInsets();

  if (online && !showBack) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <View style={[styles.pill, online ? styles.back : styles.offline]}>
        <Ionicons
          name={online ? 'cloud-done-outline' : 'cloud-offline-outline'}
          size={14}
          color={colors.white}
        />
        <AppText variant="caption" color={colors.white}>
          {online ? t('Conectado · actualizando') : t('Sin conexión · se actualiza al volver la red')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  offline: { backgroundColor: colors.danger },
  back: { backgroundColor: colors.green },
});
