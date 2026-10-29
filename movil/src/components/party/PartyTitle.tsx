import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import type { useLiveLocation } from '@/src/hooks/useLiveLocation';
import { colors, radius, spacing } from '@/src/theme';

type Props = {
  name: string;
  destination: string;
  duration: string;
  routeStatus: string;
  streetRouting: boolean;
  routeError: boolean;
  live: Pick<ReturnType<typeof useLiveLocation>, 'isLive' | 'message' | 'status' | 'retry'>;
};

export function PartyTitle({ name, destination, duration, routeStatus, streetRouting, routeError, live }: Props) {
  return (
    <View style={styles.titleBlock}>
      <AppText variant="h2">{name}</AppText>
      <View style={styles.destinationRow}>
        <Ionicons name="location" size={13} color={colors.accent} />
        <AppText variant="caption" color={colors.textSoft}>
          {destination} · ETA {duration}
        </AppText>
      </View>
      <View style={styles.gpsRow}>
        <View
          style={[
            styles.gpsDot,
            { backgroundColor: live.isLive ? colors.lime : colors.accent },
          ]}
        />
        <AppText
          variant="caption"
          color={colors.textSoft}
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {live.message}
        </AppText>
        {live.status === 'denied' || live.status === 'error' || live.status === 'demo' ? (
          <Pressable onPress={live.retry} hitSlop={8}>
            <AppText variant="label" color={colors.lime} style={{ fontSize: 9 }}>
              REINTENTAR
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.routeEngineRow}>
        <Ionicons
          name={streetRouting ? 'git-network-outline' : 'git-branch-outline'}
          size={13}
          color={streetRouting ? colors.lime : colors.muted}
        />
        <AppText
          variant="caption"
          color={routeError ? colors.accent : colors.muted}
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {routeStatus}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: { marginTop: spacing.lg },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(6,8,11,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  routeEngineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingLeft: 2,
  },
});
