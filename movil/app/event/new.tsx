import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, IconButton, Input } from '@/src/components/ui';
import { errorMessage } from '@/src/lib/alerts';
import { fetchRouteThrough } from '@/src/lib/event-routes';
import { parseEventStart, type EventRoute } from '@/src/lib/events';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import { formatSearchDistance, searchPlaces, type SearchPlace } from '@/src/lib/place-search';
import { useCreateEvent } from '@/src/hooks/useEvents';
import { useLiveLocation } from '@/src/hooks/useLiveLocation';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

const MAX_POINTS = 5;

function pointLabel(index: number, total: number) {
  if (total === 1) return t('Ubicación');
  if (index === 0) return t('Salida');
  if (index === total - 1) return t('Meta');
  return t('Parada {0}', index);
}

export default function NewEventScreen() {
  const router = useRouter();
  const live = useLiveLocation();
  const createEvent = useCreateEvent();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [points, setPoints] = useState<SearchPlace[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [route, setRoute] = useState<EventRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const searchToken = useRef(0);
  const routeController = useRef<AbortController | null>(null);
  const routeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasQuery = query.trim().length >= 3;
  const visibleResults = hasQuery ? results : [];
  const searchingNow = hasQuery && searching;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) return;

    const token = searchToken.current + 1;
    searchToken.current = token;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        setSearching(true);
        setSearchError(null);
        try {
          const found = await searchPlaces(trimmed, live.location, controller.signal);
          if (searchToken.current !== token) return;
          setResults(found);
          setSearchError(found.length === 0 ? t('Sin resultados. Prueba otra palabra.') : null);
        } catch {
          if (controller.signal.aborted || searchToken.current !== token) return;
          setResults([]);
          setSearchError(t('No pudimos buscar ahora. Revisa tu conexión.'));
        } finally {
          if (searchToken.current === token) setSearching(false);
        }
      })();
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, live.location]);

  useEffect(
    () => () => {
      if (routeTimer.current) clearTimeout(routeTimer.current);
      routeController.current?.abort();
    },
    [],
  );

  const recalculateRoute = useCallback((nextPoints: SearchPlace[]) => {
    if (routeTimer.current) clearTimeout(routeTimer.current);
    routeController.current?.abort();

    if (nextPoints.length < 2) {
      setRoute(null);
      setRouteError(null);
      setCalculating(false);
      return;
    }

    setCalculating(true);
    setRouteError(null);
    const controller = new AbortController();
    routeController.current = controller;

    routeTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const computed = await fetchRouteThrough(nextPoints, controller.signal);
          if (controller.signal.aborted) return;
          setRoute(computed);
        } catch (error) {
          if (controller.signal.aborted) return;
          setRoute(null);
          setRouteError(
            errorMessage(error, t('No pudimos calcular la ruta del evento.')),
          );
        } finally {
          if (!controller.signal.aborted) setCalculating(false);
        }
      })();
    }, 300);
  }, []);

  const addPoint = (place: SearchPlace) => {
    if (points.length >= MAX_POINTS) {
      setFormError(t('Máximo {0} puntos por evento.', MAX_POINTS));
      return;
    }
    const next = [...points, place];
    setPoints(next);
    setQuery('');
    setResults([]);
    setSearchError(null);
    setFormError(null);
    recalculateRoute(next);
  };

  const removePoint = (index: number) => {
    const next = points.filter((_, itemIndex) => itemIndex !== index);
    setPoints(next);
    setFormError(null);
    recalculateRoute(next);
  };

  const publish = async () => {
    setFormError(null);
    if (!title.trim()) {
      setFormError(t('Escribe un título para el evento.'));
      return;
    }
    const start = parseEventStart(startDate, startTime);
    if (!start.ok) {
      setFormError(start.error);
      return;
    }
    if (points.length === 0) {
      setFormError(t('Elige al menos un punto: una ubicación o una salida y una meta.'));
      return;
    }
    if (points.length > MAX_POINTS) {
      setFormError(t('Máximo {0} puntos por evento.', MAX_POINTS));
      return;
    }
    if (points.length >= 2 && !route) {
      setFormError(
        routeError ?? t('Espera a que se calcule la ruta o ajusta los puntos.'),
      );
      return;
    }

    const useRoute = points.length >= 2 && route != null;
    const first = points[0];
    const end = points[points.length - 1];

    try {
      const created = await createEvent.mutateAsync({
        title,
        description,
        latitude: first.latitude,
        longitude: first.longitude,
        locationLabel: useRoute ? `${first.name} → ${end.name}` : first.name,
        route: useRoute ? route : null,
        startsAt: start.iso,
      });
      router.replace(`/event/${created.id}` as Href);
    } catch (error) {
      setFormError(
        errorMessage(error, t('No pudimos guardar el evento.')),
      );
    }
  };

  const canPublish =
    title.trim().length > 0 &&
    startDate.trim().length > 0 &&
    points.length > 0 &&
    (points.length < 2 || (route != null && !calculating)) &&
    !createEvent.isPending;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.header}>
            <IconButton icon="close" size={40} onPress={() => router.back()} />
            <AppText variant="label" color={colors.accent}>{t('NUEVO EVENTO')}</AppText>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.heading}>
            <AppText variant="h1">{t('Crea una quedada.')}</AppText>
            <AppText variant="body" color={colors.muted} style={{ marginTop: 6 }}>
              {t('Elige la salida, las paradas y la meta. La ruta se calcula por calles reales y se publica para todos.')}
            </AppText>
          </View>

          <View style={styles.fields}>
            <Input
              label={t('Título')}
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                setFormError(null);
              }}
              placeholder={t('Ruta a la montaña, quedada en el malecón…')}
              maxLength={80}
            />
            <View style={styles.dateRow}>
              <Input
                label={t('Fecha')}
                value={startDate}
                onChangeText={(value) => {
                  setStartDate(value);
                  setFormError(null);
                }}
                placeholder="AAAA-MM-DD"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                style={styles.dateField}
              />
              <Input
                label={t('Hora')}
                value={startTime}
                onChangeText={(value) => {
                  setStartTime(value);
                  setFormError(null);
                }}
                placeholder="HH:MM"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                style={styles.dateField}
              />
            </View>
            <Input
              label={t('Descripción (opcional)')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('Punto de encuentro, hora, detalles…')}
              multiline
              numberOfLines={3}
              maxLength={280}
              inputStyle={styles.descriptionInput}
            />
          </View>

          <View style={styles.section}>
            <AppText variant="label" color={colors.muted}>{t('Puntos del evento')}</AppText>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t('Busca una calle, plaza o sitio…')}
              autoCorrect={false}
              rightSlot={
                searchingNow ? (
                  <ActivityIndicator color={colors.dim} style={{ paddingHorizontal: 12 }} />
                ) : (
                  <Ionicons
                    name="search"
                    size={18}
                    color={colors.dim}
                    style={{ paddingHorizontal: 12 }}
                  />
                )
              }
            />

            {hasQuery ? (
              <Card style={styles.results}>
                {visibleResults.length === 0 ? (
                  <AppText variant="caption" color={colors.muted}>
                    {searchError ?? t('Buscando lugares…')}
                  </AppText>
                ) : (
                  visibleResults.slice(0, 6).map((place) => (
                    <Pressable
                      key={place.id}
                      onPress={() => addPoint(place)}
                      style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}
                    >
                      <Ionicons name="location-outline" size={14} color={colors.accent} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="caption" color={colors.text} numberOfLines={1}>
                          {place.name}
                        </AppText>
                        {place.detail ? (
                          <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                            {place.detail}
                          </AppText>
                        ) : null}
                      </View>
                      <AppText variant="caption" color={colors.muted}>
                        {formatSearchDistance(place.distanceM)}
                      </AppText>
                      <Ionicons name="add" size={16} color={colors.lime} />
                    </Pressable>
                  ))
                )}
              </Card>
            ) : null}

            {points.map((point, index) => (
              <View key={`${point.id}-${index}`} style={styles.pointRow}>
                <View style={styles.pointBadge}>
                  <AppText variant="label" color="#120802" style={styles.pointBadgeText}>
                    {index + 1}
                  </AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {pointLabel(index, points.length)}
                  </AppText>
                  <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                    {point.name}
                  </AppText>
                </View>
                <IconButton icon="close" size={28} tone="ghost" onPress={() => removePoint(index)} />
              </View>
            ))}

            <AppText variant="caption" color={colors.dim}>
              {t('Con 1 punto el evento es una ubicación. Con 2 o más, la app crea la ruta completa de salida a meta (máximo')}{' '}{MAX_POINTS}{' '}{t('puntos).')}
            </AppText>
          </View>

          {calculating ? (
            <Card style={styles.routeCard}>
              <ActivityIndicator color={colors.lime} />
              <AppText variant="caption" color={colors.muted}>
                {t('Calculando la ruta por calles…')}
              </AppText>
            </Card>
          ) : route ? (
            <Card style={styles.routeCard}>
              <Ionicons name="git-branch" size={18} color={colors.lime} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">
                  {formatRouteDistance(route.distanceM)} · {formatRouteTime(route.timeMs)}
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {t('Ruta por calles con')}{' '}{route.coordinates.length}{' '}{t('puntos')}
                </AppText>
              </View>
            </Card>
          ) : routeError ? (
            <Card style={[styles.routeCard, styles.routeError]}>
              <Ionicons name="warning-outline" size={18} color={colors.accent} />
              <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
                {routeError}
              </AppText>
            </Card>
          ) : null}

          {formError ? (
            <Card style={[styles.routeCard, styles.routeError]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.accent} />
              <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
                {formError}
              </AppText>
            </Card>
          ) : null}

          <Button
            label={createEvent.isPending ? 'Publicando…' : t('Publicar evento')}
            icon="send"
            size="lg"
            loading={createEvent.isPending}
            disabled={!canPublish}
            onPress={() => void publish()}
            style={{ marginTop: spacing.md }}
          />

          <View style={styles.footer}>
            <Ionicons name="globe-outline" size={13} color={colors.dim} />
            <AppText variant="caption" color={colors.dim} style={{ flex: 1 }}>
              {t('El evento es público: cualquiera puede ver la ubicación o la ruta y navegar hasta la salida.')}
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  heading: { marginTop: spacing.lg, marginBottom: spacing.md },
  fields: { gap: spacing.md },
  descriptionInput: { minHeight: 72, textAlignVertical: 'top' },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  results: { gap: 2, padding: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pointBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointBadgeText: { fontSize: 10 },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateField: { flex: 1 },
  routeError: { borderColor: 'rgba(255,90,31,0.35)' },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing.lg,
    paddingHorizontal: 4,
  },
});
