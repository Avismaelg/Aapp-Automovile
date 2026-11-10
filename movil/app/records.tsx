import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Card, EmptyState, IconButton, Pill, Screen } from '@/src/components/ui';
import { segmentStats, useHighwaySegments, type HighwaySegment, type SegmentStats } from '@/src/lib/highway-records';
import { useTrips } from '@/src/store/trips';
import { colors, radius, spacing } from '@/src/theme';
import { displaySpeed, speedUnit, t } from '@/src/i18n';

// P0-4 (docs/AUDITORIA-PRODUCCION.md): antes había una clasificación pública
// de velocidad máxima por tramo («Corre en este tramo para entrar al
// ranking»). Ahora solo tus datos, en tu teléfono y sin velocidades: cuántas
// veces recorriste cada autopista y qué parte del recorrido fue dentro del
// límite.

// Las rutas recientes bastan y no recorren todo el historial en cada render.
const RECENT_TRIPS = 30;

export default function RecordsScreen() {
  const router = useRouter();
  const { segments, isLoading } = useHighwaySegments();
  const trips = useTrips((state) => state.trips);

  const stats = useMemo(() => {
    const recent = trips.filter((trip) => !trip.test).slice(0, RECENT_TRIPS);
    return new Map(segments.map((segment) => [segment.id, segmentStats(recent, segment)]));
  }, [segments, trips]);

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-back" size={40} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.accent}>{t('SOLO PARA TI')}</AppText>
          <AppText variant="h1" style={{ marginTop: 2 }}>{t('Tus autopistas')}</AppText>
        </View>
      </View>

      <Card style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.lime} />
        <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
          {t('Tus últimos viajes por cada autopista y qué parte fuiste dentro del límite. Se calcula en tu teléfono y nadie más lo ve. Caravana no premia la velocidad.')}
        </AppText>
      </Card>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}

      {segments.map((segment) => (
        <SegmentCard key={segment.id} segment={segment} stats={stats.get(segment.id)} />
      ))}

      {segments.length === 0 ? (
        <EmptyState
          icon="map-outline"
          title={t('Sin tramos todavía')}
          description={t('Cuando haya autopistas configuradas verás aquí tus viajes por cada una.')}
        />
      ) : null}
    </Screen>
  );
}

function SegmentCard({ segment, stats }: { segment: HighwaySegment; stats?: SegmentStats }) {
  const passes = stats?.passes ?? 0;
  const pct = stats?.withinLimitPct ?? null;
  return (
    <Card style={styles.segment}>
      <View style={styles.segmentHeader}>
        <View style={styles.segmentIcon}>
          <Ionicons name="navigate" size={18} color={colors.lime} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {segment.name}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {segment.city ?? t('República Dominicana')}{' '}{t('· límite')}{' '}{displaySpeed(segment.speedLimitKmh)}{' '}{speedUnit()}
          </AppText>
        </View>
        <Pill label={passes === 1 ? t('1 viaje') : t('{0} viajes', passes)} tone="neutral" />
      </View>
      <AppText variant="caption" color={pct == null ? colors.dim : colors.text}>
        {pct == null
          ? t('Aún no la has recorrido en tus últimos viajes.')
          : t('{0} % del recorrido dentro del límite', pct)}
      </AppText>
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
  loading: { alignItems: 'center', paddingVertical: spacing.md },
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
});
