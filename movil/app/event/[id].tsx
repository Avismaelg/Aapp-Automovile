import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { AppText, Button, Card, IconButton, Pill, Screen } from '@/src/components/ui';
import { useEvent } from '@/src/hooks/useEvents';
import { formatEventDate } from '@/src/lib/events';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import { useChosenDestination } from '@/src/store/destination';
import { colors, radius, spacing } from '@/src/theme';

const SKETCH_WIDTH = 360;
const SKETCH_HEIGHT = 200;
const SKETCH_PADDING = 24;

// Trazado esquemático de la ruta del evento: siempre visible, sin depender de
// un segundo WebView. La navegación real se abre en el mapa principal.
function RouteSketch({ coordinates }: { coordinates: [number, number][] }) {
  const projection = useMemo(() => {
    if (coordinates.length < 2) return null;

    const lats = coordinates.map((coordinate) => coordinate[0]);
    const lngs = coordinates.map((coordinate) => coordinate[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanX = Math.max((maxLng - minLng) * latScale, 1e-7);
    const spanY = Math.max(maxLat - minLat, 1e-7);
    const scale = Math.min(
      (SKETCH_WIDTH - SKETCH_PADDING * 2) / spanX,
      (SKETCH_HEIGHT - SKETCH_PADDING * 2) / spanY,
    );
    const offsetX = (SKETCH_WIDTH - spanX * scale) / 2;
    const offsetY = (SKETCH_HEIGHT - spanY * scale) / 2;

    const toPoint = (coordinate: [number, number]) => ({
      x: offsetX + (coordinate[1] - minLng) * latScale * scale,
      y: offsetY + (maxLat - coordinate[0]) * scale,
    });

    return {
      points: coordinates
        .map((coordinate) => {
          const point = toPoint(coordinate);
          return `${point.x},${point.y}`;
        })
        .join(' '),
      start: toPoint(coordinates[0]),
      end: toPoint(coordinates[coordinates.length - 1]),
    };
  }, [coordinates]);

  return (
    <Svg
      viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`}
      style={styles.sketch}
      accessibilityLabel="Trazado de la ruta del evento"
    >
      {projection ? (
        <>
          <Polyline
            points={projection.points}
            fill="none"
            stroke="#070a0f"
            strokeWidth={11}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Polyline
            points={projection.points}
            fill="none"
            stroke="#ff6a2b"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle
            cx={projection.start.x}
            cy={projection.start.y}
            r={7}
            fill="#c9ff4d"
            stroke="#06080b"
            strokeWidth={2}
          />
          <Circle
            cx={projection.end.x}
            cy={projection.end.y}
            r={7}
            fill="#ff5a1f"
            stroke="#06080b"
            strokeWidth={2}
          />
        </>
      ) : null}
    </Svg>
  );
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { event, isLoading } = useEvent(id);

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
        <>
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

          <View style={styles.sketchWrap}>
            <RouteSketch coordinates={event.route.coordinates} />
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#c9ff4d' }]} />
                <AppText variant="caption" color={colors.muted}>Salida</AppText>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#ff5a1f' }]} />
                <AppText variant="caption" color={colors.muted}>Meta</AppText>
              </View>
            </View>
          </View>
        </>
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
  sketchWrap: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  sketch: { width: '100%', height: 200 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingBottom: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  pending: { marginTop: spacing.sm },
});
