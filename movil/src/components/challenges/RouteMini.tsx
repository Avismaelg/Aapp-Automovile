import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppText } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/theme';

export function RouteMini({
  fromLabel,
  toLabel,
  distanceKm,
}: {
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
}) {
  return (
    <View style={styles.routeMini}>
      <Svg width="100%" height={86} viewBox="0 0 320 86" preserveAspectRatio="none">
        <Path d="M0 26 C 52 22, 74 8, 120 18 S 200 58, 246 48 S 290 26, 320 30" stroke="#17212B" strokeWidth={14} fill="none" />
        <Path
          d="M18 70 C 70 70, 74 34, 138 34 S 222 68, 300 20"
          stroke={colors.accent}
          strokeWidth={10}
          fill="none"
          opacity={0.12}
          strokeLinecap="round"
        />
        <Path
          d="M18 70 C 70 70, 74 34, 138 34 S 222 68, 300 20"
          stroke={colors.accent}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="8 7"
        />
        <Circle cx={18} cy={70} r={7} fill={colors.lime} />
        <Circle cx={18} cy={70} r={13} fill={colors.lime} opacity={0.2} />
        <Circle cx={300} cy={20} r={7} fill={colors.accent} />
        <Circle cx={300} cy={20} r={13} fill={colors.accent} opacity={0.2} />
      </Svg>
      <View style={styles.routeMiniLabels}>
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.lime} style={{ fontSize: 8 }}>SALIDA</AppText>
          <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>{fromLabel}</AppText>
        </View>
        <View style={styles.routeDistance}>
          <Ionicons name="navigate" size={11} color={colors.muted} />
          <AppText variant="label" color={colors.muted} style={{ fontSize: 9 }}>{distanceKm} KM</AppText>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <AppText variant="label" color={colors.accent} style={{ fontSize: 8 }}>META</AppText>
          <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>{toLabel}</AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  routeMini: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    overflow: 'hidden',
  },
  routeMiniLabels: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  routeDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
});
