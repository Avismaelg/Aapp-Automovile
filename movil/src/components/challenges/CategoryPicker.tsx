import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import type { ChallengeCategory } from '@/src/types/models';
import { vehicleKindMeta, vehicleKinds } from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

const categoryOptions: {
  key: ChallengeCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'mixed', label: 'Mixto', icon: 'shuffle' },
  ...vehicleKinds.map((kind) => ({
    key: kind,
    label: vehicleKindMeta[kind].shortLabel,
    icon: vehicleKindMeta[kind].icon,
  })),
];

const categoryNotes: Record<ChallengeCategory, string> = {
  mixed: 'Mixto: coches, motos, EV y camiones compiten por llegada. Sin premios por velocidad máxima.',
  ev: 'EV: cuenta la autonomía y las paradas de carga. La batería forma parte del reto.',
  truck: 'Camiones: categoría propia, con límites de peso y conducción profesional.',
  motorcycle: 'Motos: categoría propia. Equipo completo y conducción defensiva.',
  car: 'Coches: categoría propia. Gana quien llega primero respetando las normas.',
};

export function CategoryPicker({
  value,
  onSelect,
}: {
  value: ChallengeCategory;
  onSelect: (category: ChallengeCategory) => void;
}) {
  return (
    <>
      <AppText variant="label" color={colors.muted} style={styles.stepLabel}>2 · CATEGORÍA</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {categoryOptions.map((option) => {
          const selected = option.key === value;
          const tint =
            option.key === 'mixed' ? colors.accent : vehicleKindMeta[option.key].color;
          return (
            <Pressable
              key={option.key}
              onPress={() => onSelect(option.key)}
              style={[
                styles.categoryChip,
                selected && { borderColor: tint, backgroundColor: `${tint}14` },
              ]}
            >
              <Ionicons name={option.icon} size={17} color={selected ? tint : colors.muted} />
              <AppText variant="caption" color={selected ? colors.text : colors.muted}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.categoryNote}>
        <Ionicons name="information-circle-outline" size={15} color={colors.cyan} />
        <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>{categoryNotes[value]}</AppText>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  stepLabel: { marginTop: spacing.lg, marginBottom: 8 },
  chipRow: { gap: 8, paddingRight: spacing.lg },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  categoryNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: spacing.md,
    backgroundColor: 'rgba(77,225,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(77,225,255,0.12)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
