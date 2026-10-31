import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
import { colors, radius, spacing } from '@/src/theme';

// Otro piloto de la party fijó (o cambió) el destino: sigue la misma ruta con
// un toque.
export function ConvoyDestinationCard({
  setterName,
  label,
  changed,
  onFollow,
  onDismiss,
}: {
  setterName: string;
  label: string;
  changed: boolean;
  onFollow: () => void;
  onDismiss: () => void;
}) {
  const chrome = useMapChrome();
  const first = setterName.split(' ')[0];
  return (
    <View style={[styles.card, chrome.surface]}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="flag" size={16} color={colors.bg} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={chrome.muted}>
            {first} {changed ? 'cambió el destino del convoy' : 'fijó el destino del convoy'}
          </AppText>
          <AppText variant="bodyStrong" color={chrome.text} numberOfLines={1}>
            {label}
          </AppText>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.ghost]} onPress={onDismiss} accessibilityRole="button">
          <AppText variant="bodyStrong" color={chrome.textSoft} style={styles.buttonText}>
            Ignorar
          </AppText>
        </Pressable>
        <Pressable style={[styles.button, styles.primary]} onPress={onFollow} accessibilityRole="button">
          <Ionicons name="navigate" size={15} color={colors.bg} />
          <AppText variant="bodyStrong" color={colors.bg} style={styles.buttonText}>
            Ir con el convoy
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
