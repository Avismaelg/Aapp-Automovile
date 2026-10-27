import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Card, EmptyState, IconButton, Pill, Screen } from '@/src/components/ui';
import {
  maxSpeedNearSegment,
  useHighwaySegments,
  useSpeedRecords,
  type HighwaySegment,
  type SpeedRecord,
} from '@/src/lib/highway-records';
import { useTrips } from '@/src/store/trips';
import { useAuth } from '@/src/store/auth';
import { colors, radius, spacing } from '@/src/theme';

function formatSpeed(speed: number) {
  return `${Math.round(speed)} km/h`;
}

function formatRecordDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

const MEDALS = ['#FFD24D', '#D9E2EF', '#E8A06B'];

export default function RecordsScreen() {
  const router = useRouter();
  const account = useAuth((state) => state.account);
  const { segments, isLoading } = useHighwaySegments();
  const { records, isDemo, isLoading: recordsLoading, refetch } = useSpeedRecords();
  const trips = useTrips((state) => state.trips);

  const bySegment = useMemo(() => {
    const map = new Map<string, SpeedRecord[]>();
    for (const record of records) {
      const list = map.get(record.segmentId) ?? [];
      list.push(record);
      map.set(record.segmentId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.maxSpeedKmh - a.maxSpeedKmh);
    }
    return map;
  }, [records]);

  const localBest = useMemo(() => {
    const map = new Map<string, number>();
    for (const segment of segments) {
      let best: number | null = null;
      for (const trip of trips) {
        const value = maxSpeedNearSegment(trip, segment.polyline);
        if (value != null) best = Math.max(best ?? 0, value);
      }
      if (best != null) map.set(segment.slug, best);
    }
    return map;
  }, [segments, trips]);

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-back" size={40} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.accent}>RÉCORDS PÚBLICOS</AppText>
          <AppText variant="h1" style={{ marginTop: 2 }}>Autopistas</AppText>
        </View>
        <IconButton icon="refresh" size={40} onPress={() => void refetch()} />
      </View>

      <Card style={styles.notice}>
        <Ionicons name="warning-outline" size={16} color={colors.accent} />
        <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
          Récords de velocidad en tramos de autopista, públicos para toda la
          comunidad. Conduce con precaución y respeta los límites.
        </AppText>
      </Card>

      {isDemo ? (
        <AppText variant="caption" color={colors.dim} style={styles.demoNote}>
          Modo demo: los récords públicos requieren una cuenta conectada. Tus
          mejores marcas locales aparecen abajo.
        </AppText>
      ) : null}

      {isLoading || recordsLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <AppText variant="caption" color={colors.muted}>Cargando récords…</AppText>
        </View>
      ) : null}

      {segments.map((segment) => {
        const top = (bySegment.get(segment.id) ?? []).slice(0, 3);
        const myRecord = account
          ? (bySegment.get(segment.id) ?? []).find((record) => record.userId === account.id)
          : undefined;
        const local = localBest.get(segment.slug);
        return (
          <SegmentCard
            key={segment.id}
            segment={segment}
            top={top}
            myBest={myRecord?.maxSpeedKmh ?? local ?? null}
            myBestIsPublic={Boolean(myRecord)}
          />
        );
      })}

      {segments.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="Sin tramos todavía"
          description="Cuando haya tramos configurados podrás competir por el récord de cada autopista."
        />
      ) : null}
    </Screen>
  );
}

function SegmentCard({
  segment,
  top,
  myBest,
  myBestIsPublic,
}: {
  segment: HighwaySegment;
  top: SpeedRecord[];
  myBest: number | null;
  myBestIsPublic: boolean;
}) {
  return (
    <Card style={styles.segment}>
      <View style={styles.segmentHeader}>
        <View style={styles.segmentIcon}>
          <Ionicons name="speedometer" size={18} color={colors.lime} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {segment.name}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {segment.city ?? 'República Dominicana'} · límite {segment.speedLimitKmh} km/h
          </AppText>
        </View>
        <Pill label={`${top.length} récords`} tone="neutral" />
      </View>

      {top.length === 0 ? (
        <View style={styles.emptyRecords}>
          <Ionicons name="flag-outline" size={15} color={colors.dim} />
          <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
            Sin récords aún. ¡Sé el primero en marcar uno en este tramo!
          </AppText>
        </View>
      ) : (
        top.map((record, index) => (
          <View key={record.id} style={styles.recordRow}>
            <View style={[styles.medal, { backgroundColor: `${MEDALS[index]}22` }]}>
              <AppText variant="label" color={MEDALS[index]} style={styles.medalText}>
                {index + 1}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.text} numberOfLines={1}>
                {record.userName}
              </AppText>
              <AppText variant="caption" color={colors.dim} numberOfLines={1}>
                {record.vehicleName ?? 'Vehículo'} · {formatRecordDate(record.recordedAt)}
              </AppText>
            </View>
            <AppText variant="bodyStrong" color={colors.lime}>
              {formatSpeed(record.maxSpeedKmh)}
            </AppText>
          </View>
        ))
      )}

      {myBest != null ? (
        <View style={styles.myBest}>
          <Ionicons name="person" size={12} color={colors.cyan} />
          <AppText variant="caption" color={colors.cyan}>
            Tu mejor: {formatSpeed(myBest)}
            {myBestIsPublic ? ' (público)' : ' (local)'}
          </AppText>
        </View>
      ) : null}

      <View style={styles.hintRow}>
        <AppText variant="caption" color={colors.dim}>
          Corre en este tramo para entrar al ranking.
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  demoNote: { marginBottom: spacing.md },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
  },
  segment: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  segmentIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRecords: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  medal: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: { fontSize: 10 },
  myBest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  hintRow: { paddingTop: 2 },
});
