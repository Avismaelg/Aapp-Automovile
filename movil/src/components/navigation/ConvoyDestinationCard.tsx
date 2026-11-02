import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';
import { INVITE_ANSWER_MS } from '@/src/lib/party-invites';

// Otro piloto de la party fijó (o cambió) el destino: sigue la misma ruta con
// un toque. Si no respondes en 15 s, la tarjeta se va sola (como «Ignorar»).
export function ConvoyDestinationCard({
  setterName,
  label,
  changed,
  compact = false,
  onFollow,
  onDismiss,
}: {
  setterName: string;
  label: string;
  changed: boolean;
  // Navegando: una sola fila, para no tapar el mapa ni el velocímetro.
  compact?: boolean;
  onFollow: () => void;
  onDismiss: () => void;
}) {
  const chrome = useMapChrome();
  const first = setterName.split(' ')[0];
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), INVITE_ANSWER_MS);
    return () => clearTimeout(timer);
  }, [label]);
  if (compact) {
    return (
      <View style={[styles.compact, chrome.surface]}>
        <Ionicons name="flag" size={16} color={chrome.text} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={chrome.muted} numberOfLines={1}>
            {first} {changed ? t('cambió el destino') : t('fijó el destino')}
          </AppText>
          <AppText variant="bodyStrong" color={chrome.text} numberOfLines={1}>
            {label}
          </AppText>
        </View>
        <Pressable
          style={[styles.compactGo, { backgroundColor: chrome.text }]}
          onPress={onFollow}
          accessibilityRole="button"
          accessibilityLabel={t('Ir con el convoy')}
        >
          <Ionicons name="navigate" size={14} color={chrome.day ? '#ffffff' : colors.bg} />
          <AppText variant="bodyStrong" color={chrome.day ? '#ffffff' : colors.bg} style={styles.buttonText}>
            {t('Ir')}
          </AppText>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Ignorar')}>
          <Ionicons name="close" size={20} color={chrome.muted} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.card, chrome.surface]}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="flag" size={16} color={colors.bg} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={chrome.muted}>
            {first} {changed ? t('cambió el destino del convoy') : t('fijó el destino del convoy')}
          </AppText>
          <AppText variant="bodyStrong" color={chrome.text} numberOfLines={1}>
            {label}
          </AppText>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.ghost]} onPress={onDismiss} accessibilityRole="button">
          <AppText variant="bodyStrong" color={chrome.textSoft} style={styles.buttonText}>
            {t('Ignorar')}
          </AppText>
        </Pressable>
        <Pressable style={[styles.button, styles.primary]} onPress={onFollow} accessibilityRole="button">
          <Ionicons name="navigate" size={15} color={colors.bg} />
          <AppText variant="bodyStrong" color={colors.bg} style={styles.buttonText}>
            {t('Ir con el convoy')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  compactGo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  card: { marginTop: spacing.sm, borderRadius: radius['2xl'], padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: 11,
  },
  ghost: { backgroundColor: 'rgba(127,127,127,0.16)' },
  primary: { backgroundColor: colors.text },
  buttonText: { fontSize: 14 },
});
