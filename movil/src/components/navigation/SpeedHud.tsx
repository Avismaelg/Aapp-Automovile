import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { GLASS } from '@/src/components/navigation/glass';
import { colors, radius, spacing } from '@/src/theme';

export function SpeedHud({
  speedLabel,
  limitKmh,
  isLive,
  street,
}: {
  speedLabel: string;
  limitKmh: number | null;
  isLive: boolean;
  street: string | null;
}) {
  return (
    <View style={styles.speedHud}>
      <View style={styles.speedRow}>
        <AppText variant="display" style={styles.speedValue}>
          {speedLabel}
        </AppText>
        {limitKmh != null ? (
          <View style={styles.speedLimit}>
            <AppText variant="label" style={styles.speedLimitText}>
              {limitKmh}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.speedMeta}>
        <View style={[styles.liveDot, !isLive && styles.liveDotOff]} />
        <AppText variant="label" color={colors.muted} style={styles.speedUnit}>
          km/h · {isLive ? 'GPS' : 'DEMO'}
        </AppText>
      </View>
      {street ? (
        <AppText
          variant="caption"
          color={colors.textSoft}
          numberOfLines={1}
          style={styles.streetName}
        >
          {street}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  speedHud: {
    minWidth: 128,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  speedValue: { fontSize: 40, lineHeight: 44 },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  speedLimit: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#ff4d5e',
    backgroundColor: '#f4f6f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedLimitText: { fontSize: 11, color: '#0b0f14' },
  streetName: { marginTop: 2, fontSize: 9, maxWidth: 160 },
  speedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  liveDotOff: { backgroundColor: colors.dim },
  speedUnit: { fontSize: 9 },
});
