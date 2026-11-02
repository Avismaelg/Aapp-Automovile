import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  EmptyState,
  IconButton,
  Pill,
  Screen,
  ScreenHeader,
  Stat,
} from '@/src/components/ui';
import { useTrips, type Trip } from '@/src/store/trips';
import { colors, radius, spacing } from '@/src/theme';
import { displayKm, displaySpeed, distanceUnit, shortMonths, speedUnit, t } from '@/src/i18n';

const MONTHS = shortMonths();

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return t('{0} h {1} min', hours, minutes);
}

function formatKm(meters: number) {
  return `${displayKm(meters / 1000, 1)} ${distanceUnit()}`;
}

function formatSpeed(kmh: number) {
  return `${displaySpeed(kmh)} ${speedUnit()}`;
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
  const removeTrip = useTrips((state) => state.removeTrip);

  const confirmRemove = (trip: Trip) => {
    Alert.alert(
      t('Borrar ruta'),
      t('{0} · {1}. Se quita de tu historial y de tus totales.', formatDate(trip.startedAt), formatKm(trip.distanceM)),
      [
        { text: t('Cancelar'), style: 'cancel' },
        { text: t('Borrar'), style: 'destructive', onPress: () => void removeTrip(trip.id) },
      ],
    );
  };

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
          accessibilityLabel={t('Récords')}
        />
      </View>
      <ScreenHeader
        title={t('Mis rutas')}
        subtitle={t('Se graban solas al conducir. Mantén pulsada una para borrarla.')}
      />

      <View style={styles.summary}>
        <Stat value={String(totals.count)} label="rutas" align="center" />
        <Stat value={formatKm(totals.distanceM)} label={t('en total')} align="center" />
        <Stat
          value={totals.bestSpeed > 0 ? formatSpeed(totals.bestSpeed) : '--'}
          label={t('máxima')}
          align="center"
        />
      </View>

      {active ? (
        <View style={styles.activeCard}>
          <View style={styles.recordingDot} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">
              {active.test ? t('Grabando viaje de prueba') : t('Grabando ruta ahora')}
            </AppText>
            <AppText variant="caption" color={colors.muted}>
              {formatDuration(now - active.startedAt)} · {formatKm(active.distanceM)} ·{' '}
              {formatSpeed(active.maxSpeedKmh)}{' '}{t('máx')}
            </AppText>
          </View>
          <IconButton
            icon="stop"
            size={38}
            onPress={() => void stopTrip()}
            accessibilityLabel={t('Terminar ruta')}
          />
        </View>
      ) : null}

      {trips.length === 0 && !active ? (
        <EmptyState
          icon="map-outline"
          title={t('Todavía no hay rutas')}
          description={t('Cuando empieces a conducir, Caravana graba la ruta con sus velocidades y la guarda aquí, incluso en segundo plano.')}
        />
      ) : null}

      {trips.length > 0 ? (
        <View style={styles.group}>
          {trips.map((trip, index) => (
            <Pressable
              key={trip.id}
              onLongPress={() => confirmRemove(trip)}
              accessibilityRole="button"
              accessibilityLabel={t('Ruta del {0}', formatDate(trip.startedAt))}
              accessibilityHint={t('Mantén pulsado para borrarla')}
              style={({ pressed }) => [
                styles.trip,
                index > 0 && styles.rowDivider,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.tripTitleRow}>
                  <AppText variant="bodyStrong">{formatDate(trip.startedAt)}</AppText>
                  {trip.test ? <Pill label={t('Prueba')} /> : null}
                  {trip.recordsSubmitted ? (
                    <Ionicons name="trophy-outline" size={13} color={colors.muted} />
                  ) : null}
                </View>
                <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
                  {formatDuration((trip.endedAt ?? trip.startedAt) - trip.startedAt)}{' '}{t('· media')}{' '}
                  {formatSpeed(trip.avgSpeedKmh)}{' '}{t('· máx')}{' '}{formatSpeed(trip.maxSpeedKmh)}
                </AppText>
              </View>
              <AppText variant="title">{formatKm(trip.distanceM)}</AppText>
            </Pressable>
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
