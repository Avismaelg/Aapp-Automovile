import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  EmptyState,
  IconButton,
  Pill,
  Screen,
  ScreenHeader,
  Stat,
} from '@/src/components/ui';
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

  // Los viajes de prueba del simulador se ven en la lista pero no suman.
  const totals = useMemo(() => {
    const real = trips.filter((trip) => !trip.test);
    const distanceM = real.reduce((sum, trip) => sum + trip.distanceM, 0);
    const bestSpeed = real.reduce((best, trip) => Math.max(best, trip.maxSpeedKmh), 0);
    return { count: real.length, distanceM, bestSpeed };
  }, [trips]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [active]);

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" size={40} onPress={() => router.back()} />
        <IconButton
          icon="trophy-outline"
          size={40}
          onPress={() => router.push('/records' as never)}
          accessibilityLabel="Récords"
        />
      </View>
      <ScreenHeader title="Mis rutas" subtitle="Se graban solas al conducir" />

      <View style={styles.summary}>
        <Stat value={String(totals.count)} label="rutas" align="center" />
        <Stat value={formatKm(totals.distanceM)} label="en total" align="center" />
        <Stat
          value={totals.bestSpeed > 0 ? formatSpeed(totals.bestSpeed) : '--'}
          label="máxima"
          align="center"
        />
      </View>

      {active ? (
        <View style={styles.activeCard}>
          <View style={styles.recordingDot} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">
              {active.test ? 'Grabando viaje de prueba' : 'Grabando ruta ahora'}
            </AppText>
            <AppText variant="caption" color={colors.muted}>
              {formatDuration(now - active.startedAt)} · {formatKm(active.distanceM)} ·{' '}
              {formatSpeed(active.maxSpeedKmh)} máx
            </AppText>
          </View>
          <IconButton
            icon="stop"
            size={38}
            onPress={() => void stopTrip()}
            accessibilityLabel="Terminar ruta"
          />
        </View>
      ) : null}

      {trips.length === 0 && !active ? (
        <EmptyState
          icon="map-outline"
          title="Todavía no hay rutas"
          description="Cuando empieces a conducir, Caravana graba la ruta con sus velocidades y la guarda aquí, incluso en segundo plano."
        />
      ) : null}

      {trips.length > 0 ? (
        <View style={styles.group}>
          {trips.map((trip, index) => (
            <View key={trip.id} style={[styles.trip, index > 0 && styles.rowDivider]}>
              <View style={{ flex: 1 }}>
                <View style={styles.tripTitleRow}>
                  <AppText variant="bodyStrong">{formatDate(trip.startedAt)}</AppText>
                  {trip.test ? <Pill label="Prueba" /> : null}
                  {trip.recordsSubmitted ? (
                    <Ionicons name="trophy-outline" size={13} color={colors.muted} />
                  ) : null}
                </View>
                <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
                  {formatDuration((trip.endedAt ?? trip.startedAt) - trip.startedAt)} · media{' '}
                  {formatSpeed(trip.avgSpeedKmh)} · máx {formatSpeed(trip.maxSpeedKmh)}
                </AppText>
              </View>
              <AppText variant="title">{formatKm(trip.distanceM)}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  trip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  tripTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
