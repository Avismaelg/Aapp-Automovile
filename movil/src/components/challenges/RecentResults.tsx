import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Pill } from '@/src/components/ui';
import type { ChallengeCategory } from '@/src/types/models';
import { vehicleCategoryLabel } from '@/src/lib/vehicles';
import { colors, spacing } from '@/src/theme';

export type RecentResult = {
  id: string;
  title: string;
  category: ChallengeCategory;
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  winner: string;
  winnerColor: string;
  time: string;
  date: string;
};

export function RecentResults({ results }: { results: RecentResult[] }) {
  return results.length === 0 ? (
    <Card style={styles.emptyHistory}>
      <Ionicons name="trophy-outline" size={21} color={colors.dim} />
      <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
        Aún no hay retos finalizados. Cuando cierres uno, el resultado quedará aquí.
      </AppText>
    </Card>
  ) : (
    results.map((item) => (
      <Card key={item.id} style={styles.recentCard}>
        <View style={[styles.recentIcon, { backgroundColor: `${item.winnerColor}1A` }]}>
          <Ionicons name="trophy" size={18} color={item.winnerColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.recentTop}>
            <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{item.title}</AppText>
            <Pill label={vehicleCategoryLabel(item.category)} tone="neutral" />
          </View>
          <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
            {item.fromLabel} → {item.toLabel} · {item.distanceKm} km
          </AppText>
          <View style={styles.recentBottom}>
            <Ionicons name="trophy-outline" size={11} color={item.winnerColor} />
            <AppText variant="caption" color={item.winnerColor}>Ganó {item.winner}</AppText>
            <View style={styles.metaDot} />
            <AppText variant="caption" color={colors.dim}>{item.time}</AppText>
            <View style={styles.metaDot} />
            <AppText variant="caption" color={colors.dim}>{item.date}</AppText>
          </View>
        </View>
      </Card>
    ))
  );
}

const styles = StyleSheet.create({
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 8,
    paddingVertical: 13,
  },
  emptyHistory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 8,
  },
  recentIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recentBottom: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.dim },
});
