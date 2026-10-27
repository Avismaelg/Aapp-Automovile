import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, EmptyState, IconButton, Screen } from '@/src/components/ui';
import { useTrips } from '@/src/store/trips';
import { colors, radius, spacing } from '@/src/theme';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${minutes} min`;
}

function formatKm(meters: number) {
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

function formatSpeed(kmh: number) {
  return `${Math.round(kmh)} km/h`;
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} · ${hours}:${minutes}`;
}

export default function TripsScreen() {
  const router = useRouter();
  const trips = useTrips((state) => state.trips);
  const active = useTrips((state) => state.active);
  const stopTrip = useTrips((state) => state.stopTrip);

  const totals = useMemo(() => {
    const distanceM = trips.reduce((sum, trip) => sum + trip.distanceM, 0);
    const durationMs = trips.reduce(
      (sum, trip) => sum + ((trip.endedAt ?? trip.startedAt) - trip.startedAt),
      0,
    );
    const bestSpeed = trips.reduce((best, trip) => Math.max(best, trip.maxSpeedKmh), 0);
    return { distanceM, durationMs, bestSpeed };
  }, [trips]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [active]);

  const liveStats = active
    ? {
        durationMs: now - active.startedAt,
        distanceM: active.distanceM,
      }
    : null;

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-back" size={40} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.accent}>RUTAS RECORRIDAS</AppText>
          <AppText variant="h1" style={{ marginTop: 2 }}>Mis rutas</AppText>
        </View>
        <IconButton
          icon="trophy-outline"
          size={40}
          onPress={() => router.push('/records' as never)}
        />
      </View>

      <Card style={styles.summary}>
        <View style={styles.summaryItem}>
          <AppText variant="h2">{trips.length}</AppText>
          <AppText variant="caption" color={colors.muted}>rutas</AppText>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <AppText variant="h2">{(totals.distanceM / 1000).toFixed(0)}</AppText>
          <AppText variant="caption" color={colors.muted}>km totales</AppText>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <AppText variant="h2" color={colors.lime}>
            {totals.bestSpeed > 0 ? Math.round(totals.bestSpeed) : '--'}
          </AppText>
          <AppText variant="caption" color={colors.muted}>km/h máx</AppText>
        </View>
      </Card>

      {active && liveStats ? (
        <Card style={styles.activeCard}>
          <View style={styles.recordingDot} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Grabando ruta ahora</AppText>
            <AppText variant="caption" color={colors.muted}>
              {formatDuration(liveStats.durationMs)} · {formatKm(liveStats.distanceM)} ·{' '}
              {formatSpeed(active.maxSpeedKmh)} máx
            </AppText>
          </View>
          <IconButton icon="stop-circle-outline" size={36} tone="accent" onPress={() => void stopTrip()} />
        </Card>
      ) : null}

      {trips.length === 0 && !active ? (
        <EmptyState
          icon="map-outline"
          title="Todavía no hay rutas"
          description="Cuando empieces a conducir, Caravana graba la ruta con sus velocidades y la guarda aquí, incluso en segundo plano."
        />
      ) : null}

      {trips.map((trip) => (
        <Card key={trip.id} style={styles.trip}>
          <View style={styles.tripIcon}>
            <Ionicons name="navigate" size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.tripTitleRow}>
              <AppText variant="bodyStrong">{formatDate(trip.startedAt)}</AppText>
              {trip.recordsSubmitted ? (
                <Ionicons name="trophy" size={13} color={colors.lime} />
              ) : null}
            </View>
            <AppText variant="caption" color={colors.muted}>
              {formatKm(trip.distanceM)} ·{' '}
              {formatDuration((trip.endedAt ?? trip.startedAt) - trip.startedAt)} · media{' '}
              {formatSpeed(trip.avgSpeedKmh)}
            </AppText>
            <View style={styles.tripSpeedRow}>
              <AppText variant="label" color={colors.lime}>
                MÁX {formatSpeed(trip.maxSpeedKmh)}
              </AppText>
              <AppText variant="caption" color={colors.dim}>
                {trip.points.length} puntos GPS
              </AppText>
            </View>
          </View>
        </Card>
      ))}
    </Screen>
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
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: 1, height: 34, backgroundColor: colors.border },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    borderColor: 'rgba(201,255,77,0.35)',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.lime,
  },
  trip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: 8,
  },
  tripIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripSpeedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
});
