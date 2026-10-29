import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, EmptyState, IconButton, Pill, Screen } from '@/src/components/ui';
import { useEvents } from '@/src/hooks/useEvents';
import { formatEventDate, type AppEvent } from '@/src/lib/events';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import { colors, radius, spacing } from '@/src/theme';

export default function EventsScreen() {
  const router = useRouter();
  const { events, isLoading, isDemo, remoteAvailable } = useEvents();

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="arrow-back" size={40} onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.accent}>QUEDADAS CON RUTA</AppText>
          <AppText variant="h1" style={{ marginTop: 2 }}>Eventos</AppText>
        </View>
        <IconButton
          icon="add"
          size={40}
          tone="accent"
          color="#120802"
          onPress={() => router.push('/event/new' as Href)}
        />
      </View>

      {isDemo ? (
        <AppText variant="caption" color={colors.dim} style={styles.note}>
          Modo demo: los eventos se guardan en este dispositivo.
        </AppText>
      ) : null}

      {!isDemo && !remoteAvailable ? (
        <Card style={styles.notice}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.accent} />
          <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
            Por ahora tus eventos se guardan en este dispositivo. Se publicarán
            para todos en cuanto el servidor esté disponible.
          </AppText>
        </Card>
      ) : null}

      {isLoading ? (
        <AppText variant="caption" color={colors.muted} style={styles.loading}>
          Cargando eventos…
        </AppText>
      ) : null}

      {!isLoading && events.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Todavía no hay eventos"
          description="Crea el primero: elige la salida, las paradas y la meta, y la app calcula la ruta por calles."
        />
      ) : null}

      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          onPress={() => router.push(`/event/${event.id}` as Href)}
        />
      ))}

      {events.length > 0 ? (
        <Pressable
          onPress={() => router.push('/event/new' as Href)}
          style={({ pressed }) => [{ opacity: pressed ? 0.82 : 1 }]}
        >
          <Card style={styles.addCard}>
            <View style={styles.addIcon}>
              <Ionicons name="calendar" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">Crear un evento con ruta</AppText>
              <AppText variant="caption" color={colors.muted}>
                Salida, paradas y meta sobre calles reales.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.dim} />
          </Card>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function EventCard({ event, onPress }: { event: AppEvent; onPress: () => void }) {
  const isRoute = Boolean(event.route);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.icon}>
            <Ionicons
              name={isRoute ? 'git-branch' : 'location'}
              size={18}
              color={isRoute ? colors.lime : colors.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" numberOfLines={1}>{event.title}</AppText>
            <AppText variant="caption" color={colors.muted} numberOfLines={1}>
              {event.hostName} · {formatEventDate(event.createdAt)}
            </AppText>
          </View>
          <Pill label={isRoute ? 'Ruta' : 'Ubicación'} tone={isRoute ? 'lime' : 'accent'} />
        </View>

        {event.route ? (
          <AppText variant="caption" color={colors.textSoft}>
            {formatRouteDistance(event.route.distanceM)} · {formatRouteTime(event.route.timeMs)} ·{' '}
            {event.route.coordinates.length} puntos
          </AppText>
        ) : event.locationLabel ? (
          <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
            {event.locationLabel}
          </AppText>
        ) : null}

        {event.pendingSync ? (
          <AppText variant="caption" color={colors.dim}>
            Guardado en el dispositivo · pendiente de publicar
          </AppText>
        ) : null}
      </Card>
    </Pressable>
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
  note: { marginBottom: spacing.sm },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  loading: { marginBottom: spacing.sm },
  card: { marginBottom: 8, gap: 6 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  addIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
