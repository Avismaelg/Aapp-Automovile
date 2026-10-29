import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, IconButton } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
import { colors, radius, spacing } from '@/src/theme';

export type RouteOption = {
  timeLabel: string;
  distanceLabel: string;
  // Minutos más que la más rápida; 0 en la más rápida.
  extraMinutes: number;
};

export function DestinationCard({
  label,
  status,
  options,
  selected,
  canConfirm,
  onSelect,
  onConfirm,
  onShare,
  onClose,
}: {
  label: string;
  status: string;
  options: RouteOption[];
  selected: number;
  canConfirm: boolean;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const chrome = useMapChrome();
  return (
    <View style={[styles.destinationCard, chrome.surface]}>
      <View style={styles.destinationRow}>
        <View style={styles.destinationIcon}>
          <Ionicons name="flag" size={15} color="#120802" />
        </View>
        <View style={styles.destinationText}>
          <AppText variant="bodyStrong" color={chrome.text} numberOfLines={1}>
            {label}
          </AppText>
          <AppText variant="caption" color={chrome.muted} numberOfLines={1}>
            {status}
          </AppText>
        </View>
        <IconButton icon="close" size={30} tone="ghost" color={chrome.muted} onPress={onClose} />
      </View>
      {options.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.options}
        >
          {options.map((option, index) => {
            const active = index === selected;
            return (
              <Pressable
                key={index}
                style={[styles.option, { borderColor: chrome.border, backgroundColor: chrome.chip }, active && styles.optionActive]}
                onPress={() => onSelect(index)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Ruta ${index + 1}: ${option.timeLabel}, ${option.distanceLabel}`}
              >
                <AppText variant="bodyStrong" color={active ? '#ffffff' : chrome.text}>
                  {option.timeLabel}
                </AppText>
                <AppText variant="caption" color={active ? '#e3efff' : chrome.muted}>
                  {option.distanceLabel}
                </AppText>
                <AppText
                  variant="label"
                  color={active ? '#ffffff' : option.extraMinutes === 0 ? (chrome.day ? '#16a34a' : colors.lime) : chrome.muted}
                  style={styles.optionTag}
                >
                  {option.extraMinutes === 0 ? 'MÁS RÁPIDA' : `+${option.extraMinutes} MIN`}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.destinationActions}>
        <Button
          label="Ir ahora"
          variant="lime"
          size="sm"
          icon="navigate"
          onPress={onConfirm}
          disabled={!canConfirm}
          style={styles.destinationAction}
        />
        <Button
          label="Compartir"
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
  options: { gap: spacing.sm },
  option: {
    minWidth: 104,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  optionActive: { backgroundColor: '#2f8cff', borderColor: '#2f8cff' },
  optionTag: { fontSize: 9, marginTop: 2 },
  destinationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  destinationAction: { flexShrink: 1 },
});
