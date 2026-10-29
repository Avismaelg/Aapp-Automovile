import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { AppText } from '@/src/components/ui';
import type { ChallengeRoute } from '@/src/types/models';
import { colors, radius, spacing } from '@/src/theme';

export function RoutePicker({
  routes,
  selectedId,
  onSelect,
}: {
  routes: ChallengeRoute[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <AppText variant="label" color={colors.muted} style={styles.stepLabel}>1 · RUTA</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {routes.map((item) => {
          const selected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item.id)}
              style={[styles.routeChip, selected && styles.routeChipActive]}
            >
              <AppText variant="caption" color={selected ? colors.text : colors.textSoft} numberOfLines={1}>
                {item.fromLabel.split(',')[0]} → {item.toLabel}
              </AppText>
              <AppText variant="label" color={selected ? colors.accent : colors.dim} style={{ fontSize: 8, marginTop: 2 }}>
                {item.distanceKm} KM · {item.etaMin} MIN
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  stepLabel: { marginTop: spacing.lg, marginBottom: 8 },
  chipRow: { gap: 8, paddingRight: spacing.lg },
  routeChip: {
    width: 176,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  routeChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
