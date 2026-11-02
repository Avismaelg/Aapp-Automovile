import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Card, EmptyState, IconButton, Pill, Screen } from '@/src/components/ui';
import {
  countsAsRecord,
  maxSpeedNearSegment,
  useHighwaySegments,
  useSpeedRecords,
  type HighwaySegment,
  type SpeedRecord,
} from '@/src/lib/highway-records';
import { useTrips } from '@/src/store/trips';
import { useAuth } from '@/src/store/auth';
import { colors, radius, spacing } from '@/src/theme';
import { displaySpeed, shortMonths, speedUnit, t } from '@/src/i18n';

function formatSpeed(speed: number) {
  return `${displaySpeed(speed)} ${speedUnit()}`;
}

function formatRecordDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = shortMonths();
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
    const limits = new Map(segments.map((segment) => [segment.id, segment.speedLimitKmh]));
    for (const record of records) {
      // Registros antiguos por encima del límite no se muestran (D-05).
      if (!countsAsRecord(record.maxSpeedKmh, limits.get(record.segmentId))) continue;
      const list = map.get(record.segmentId) ?? [];
      list.push(record);
      map.set(record.segmentId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.maxSpeedKmh - a.maxSpeedKmh);
    }
    return map;
  }, [records, segments]);

  const localBest = useMemo(() => {
    const map = new Map<string, number>();
    // Solo las rutas recientes: suficientes para la mejor marca local.
    const recent = trips.slice(0, 10);
    for (const segment of segments) {
      let best: number | null = null;
      for (const trip of recent) {
        const value = maxSpeedNearSegment(trip, segment.polyline);
        if (countsAsRecord(value, segment.speedLimitKmh)) best = Math.max(best ?? 0, value);
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
          <AppText variant="label" color={colors.accent}>{t('RÉCORDS PÚBLICOS')}</AppText>
          <AppText variant="h1" style={{ marginTop: 2 }}>{t('Autopistas')}</AppText>
        </View>
        <IconButton icon="refresh" size={40} onPress={() => void refetch()} />
      </View>

      <Card style={styles.notice}>
        <Ionicons name="warning-outline" size={16} color={colors.accent} />
        <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
          {t('Récords por tramo de autopista, públicos para toda la comunidad. Solo cuentan las pasadas que respetan el límite de velocidad: nunca se premia ir más rápido.')}
        </AppText>
      </Card>

      {isDemo ? (
        <AppText variant="caption" color={colors.dim} style={styles.demoNote}>
          {t('Modo demo: los récords públicos requieren una cuenta conectada. Tus mejores marcas locales aparecen abajo.')}
        </AppText>
      ) : null}

      {isLoading || recordsLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <AppText variant="caption" color={colors.muted}>{t('Cargando récords…')}</AppText>
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
          title={t('Sin tramos todavía')}
          description={t('Cuando haya tramos configurados podrás competir por el récord de cada autopista.')}
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
            {segment.city ?? t('República Dominicana')}{' '}{t('· límite')}{' '}{displaySpeed(segment.speedLimitKmh)}{' '}{speedUnit()}
          </AppText>
        </View>
        <Pill label={t('{0} récords', top.length)} tone="neutral" />
      </View>

      {top.length === 0 ? (
        <View style={styles.emptyRecords}>
          <Ionicons name="flag-outline" size={15} color={colors.dim} />
          <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
            {t('Sin récords aún. ¡Sé el primero en marcar uno en este tramo!')}
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
                {record.vehicleName ?? t('Vehículo')} · {formatRecordDate(record.recordedAt)}
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
            {t('Tu mejor:')}{' '}{formatSpeed(myBest)}
            {myBestIsPublic ? t(' (público)') : ' (local)'}
          </AppText>
        </View>
      ) : null}

      <View style={styles.hintRow}>
        <AppText variant="caption" color={colors.dim}>
          {t('Corre en este tramo para entrar al ranking.')}
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
