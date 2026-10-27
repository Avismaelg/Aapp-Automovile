import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share, StyleSheet, View } from 'react-native';

import { WorldMap } from '@/src/components/WorldMap';
import { AppText, Button, Card, IconButton, Pill, Screen } from '@/src/components/ui';
import { useEvent } from '@/src/hooks/useEvents';
import { useLiveLocation } from '@/src/hooks/useLiveLocation';
import { formatEventDate } from '@/src/lib/events';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import { useChosenDestination } from '@/src/store/destination';
import { colors, radius, spacing } from '@/src/theme';

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { event, isLoading } = useEvent(id);
  const live = useLiveLocation();

  if (!event) {
    return (
      <Screen>
        <View style={styles.header}>
          <IconButton icon="arrow-back" size={40} onPress={() => router.back()} />
          <AppText variant="h2" style={{ flex: 1 }}>Evento</AppText>
        </View>
        <Card style={styles.missing}>
          <Ionicons name="calendar-outline" size={24} color={colors.dim} />
          <AppText variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
            {isLoading
              ? 'Cargando evento…'
              : 'No encontramos este evento. Puede que ya no esté publicado.'}
          </AppText>
        </Card>
      </Screen>
    );
  }

  const isRoute = Boolean(event.route);
  const destination = event.route
    ? {
        latitude: event.route.coordinates[event.route.coordinates.length - 1][0],
        longitude: event.route.coordinates[event.route.coordinates.length - 1][1],
        label: 'Meta',
      }
    : event.latitude != null && event.longitude != null
      ? { latitude: event.latitude, longitude: event.longitude, label: event.locationLabel ?? 'Evento' }
      : null;

  const navigateToEvent = () => {
    const start = event.route
      ? event.route.coordinates[0]
      : event.latitude != null && event.longitude != null
        ? ([event.latitude, event.longitude] as [number, number])
        : null;
    if (!start) return;
    const store = useChosenDestination.getState();
    store.setDestination({ latitude: start[0], longitude: start[1], label: event.title });
    store.startNavigation();
    router.replace('/');
  };

  const share = async () => {
    try {
      await Share.share({
        message: `${event.title} en Caravana${event.locationLabel ? ` · ${event.locationLabel}` : ''}${
          event.route
            ? ` · ${formatRouteDistance(event.route.distanceM)} · ${formatRouteTime(event.route.timeMs)}`
            : ''
        }\ncaravana://event/${event.id}`,
        url: `caravana://event/${event.id}`,
      });
    } catch {
      // Compartir cancelado.
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-back" size={40} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.accent}>EVENTO</AppText>
          <AppText variant="h1" numberOfLines={2} style={{ marginTop: 2 }}>
            {event.title}
          </AppText>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Pill label={isRoute ? 'Ruta' : 'Ubicación'} tone={isRoute ? 'lime' : 'accent'} />
        <AppText variant="caption" color={colors.muted} numberOfLines={1}>
          {event.hostName} · {formatEventDate(event.createdAt)}
        </AppText>
      </View>

      {event.description ? (
        <AppText variant="body" color={colors.textSoft} style={styles.description}>
          {event.description}
        </AppText>
      ) : null}

      {isRoute && event.route ? (
        <Card style={styles.stats}>
          <View style={styles.statItem}>
            <AppText variant="h2">{formatRouteDistance(event.route.distanceM)}</AppText>
            <AppText variant="caption" color={colors.muted}>distancia</AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <AppText variant="h2">{formatRouteTime(event.route.timeMs)}</AppText>
            <AppText variant="caption" color={colors.muted}>duración</AppText>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <AppText variant="h2">{event.route.coordinates.length}</AppText>
            <AppText variant="caption" color={colors.muted}>puntos</AppText>
          </View>
        </Card>
      ) : null}

      {event.route || destination ? (
        <View style={styles.mapWrap}>
          <WorldMap
            members={[]}
            destination={destination}
            location={live.location}
            route={
              event.route
                ? {
                    coordinates: event.route.coordinates,
                    distanceM: event.route.distanceM,
                    timeMs: event.route.timeMs,
                    source: 'osrm',
                  }
                : null
            }
            fitRoute={event.route?.coordinates ?? null}
            autoFollow={false}
            mode="3d"
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      {event.locationLabel ? (
        <View style={styles.pointRow}>
          <Ionicons name="flag" size={16} color={colors.lime} />
          <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
            {event.locationLabel}
          </AppText>
        </View>
      ) : null}

      {event.pendingSync ? (
        <AppText variant="caption" color={colors.dim} style={styles.pending}>
          Guardado en este dispositivo · pendiente de publicar en la nube.
        </AppText>
      ) : null}

      <Button
        label={isRoute ? 'Navegar a la salida' : 'Navegar al evento'}
        icon="navigate"
        size="lg"
        onPress={navigateToEvent}
        style={{ marginTop: spacing.md }}
      />
      <Button
        label="Compartir evento"
        variant="secondary"
        icon="share-social-outline"
        size="lg"
        onPress={() => void share()}
        style={{ marginTop: spacing.sm }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  missing: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing['3xl'],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  description: { marginBottom: spacing.md },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: 1, height: 34, backgroundColor: colors.border },
  mapWrap: {
    height: 260,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  pending: { marginTop: spacing.sm },
});
