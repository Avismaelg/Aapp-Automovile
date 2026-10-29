import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, IconButton } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/theme';

export function DestinationCard({
  label,
  status,
  canConfirm,
  onConfirm,
  onShare,
  onClose,
}: {
  label: string;
  status: string;
  canConfirm: boolean;
  onConfirm: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.destinationCard}>
      <View style={styles.destinationRow}>
        <View style={styles.destinationIcon}>
          <Ionicons name="flag" size={15} color="#120802" />
        </View>
        <View style={styles.destinationText}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {label}
          </AppText>
          <AppText variant="caption" color={colors.muted} numberOfLines={1}>
            {status}
          </AppText>
        </View>
        <IconButton icon="close" size={30} tone="ghost" onPress={onClose} />
      </View>
      <View style={styles.destinationActions}>
        <Button
          label="Confirmar ruta"
          variant="lime"
          size="sm"
          icon="navigate"
           onPress={onConfirm}
          disabled={!canConfirm}
          style={styles.destinationAction}
        />
        <Button
          label="Compartir ruta"
          variant="secondary"
          size="sm"
          icon="share-social-outline"
          onPress={onShare}
          style={styles.destinationAction}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  destinationCard: {
    backgroundColor: 'rgba(11,15,20,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  destinationIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationText: { flex: 1 },
  destinationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  destinationAction: { flexShrink: 1 },
});
