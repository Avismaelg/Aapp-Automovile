import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, IconButton } from '@/src/components/ui';
import { useLiveLocation } from '@/src/hooks/useLiveLocation';
import {
  formatSearchDistance,
  rankPlaces,
  searchCategory,
  searchKnownPlaces,
  searchPlaces,
  type SearchPlace,
  type StopCategory,
} from '@/src/lib/place-search';
import { useChosenDestination, type ChosenDestination } from '@/src/store/destination';
import { colors, fonts, radius, spacing } from '@/src/theme';

const STOP_SHORTCUTS: { label: string; category: StopCategory; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Gasolinera', category: 'fuel', icon: 'water-outline' },
  { label: 'Comida', category: 'food', icon: 'restaurant-outline' },
  { label: 'Farmacia', category: 'pharmacy', icon: 'medkit-outline' },
  { label: 'Cajero', category: 'atm', icon: 'cash-outline' },
  { label: 'Súper', category: 'supermarket', icon: 'cart-outline' },
];

export default function DestinationScreen() {
  const live = useLiveLocation();
  const setDestination = useChosenDestination((state) => state.setDestination);
  const startNavigation = useChosenDestination((state) => state.startNavigation);
  const recents = useChosenDestination((state) => state.recents);
  const params = useLocalSearchParams<{ lat?: string; lng?: string; label?: string; mode?: string }>();
  // «Añadir parada»: lo que elijas se mete en la ruta en vez de cambiar el destino.
  const isStop = params.mode === 'stop';
  const addStop = useChosenDestination((state) => state.addStop);

  const [query, setQuery] = useState('');
  // Atajo de parada activo: los resultados vienen por tipo, no por texto.
  const [category, setCategory] = useState<StopCategory | null>(null);
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchToken = useRef(0);
  const liveLocationRef = useRef(live.location);

  const hasQuery = query.trim().length >= 3;
  const visibleResults = hasQuery ? results : [];
  const searchingNow = hasQuery && isSearching;

  // Los destinos conocidos de RD salen al instante (y sin conexión); los de
  // internet se suman al llegar.
  const handleQueryChange = (value: string) => {
    setCategory(null);
    setQuery(value);
    setResults(
      value.trim().length >= 3 ? rankPlaces(searchKnownPlaces(value, liveLocationRef.current)) : [],
    );
    setSearchError(null);
    setIsSearching(false);
  };

  useEffect(() => {
    liveLocationRef.current = live.location;
  }, [live.location]);

  const sharedLatitude = Number.parseFloat(params.lat ?? '');
  const sharedLongitude = Number.parseFloat(params.lng ?? '');
  const isSharedRoute =
    Number.isFinite(sharedLatitude) &&
    Number.isFinite(sharedLongitude) &&
    Math.abs(sharedLatitude) <= 90 &&
    Math.abs(sharedLongitude) <= 180;

  const acceptSharedRoute = () => {
    setDestination({
      latitude: sharedLatitude,
      longitude: sharedLongitude,
      label: (Array.isArray(params.label) ? params.label[0] : params.label)?.trim() || 'Destino compartido',
    });
    startNavigation();
    router.replace('/');
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3 || category) return;

    const token = searchToken.current + 1;
    searchToken.current = token;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        setIsSearching(true);
        setSearchError(null);
        try {
          const found = await searchPlaces(trimmed, liveLocationRef.current, controller.signal);
          if (searchToken.current !== token) return;
          setResults(found);
          setSearchError(found.length === 0 ? 'Sin resultados. Prueba con otra palabra.' : null);
        } catch {
          if (controller.signal.aborted || searchToken.current !== token) return;
          // Solo falla si no hay internet y tampoco hay destinos conocidos.
          setResults([]);
          setSearchError('No pudimos buscar ahora. Revisa tu conexión.');
        } finally {
          if (searchToken.current === token) setIsSearching(false);
        }
      })();
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, category]);

  const choose = (place: ChosenDestination) => {
    if (isStop) {
      addStop(
        { latitude: place.latitude, longitude: place.longitude, label: place.label },
        liveLocationRef.current,
      );
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return;
    }
    setDestination(place);
    router.replace('/');
  };

  const selectRecent = (place: ChosenDestination) => choose(place);

  // Atajo de parada: todas las de ese tipo cerca de ti, por cercanía.
  const searchShortcut = async (shortcut: StopCategory, label: string) => {
    setCategory(shortcut);
    setQuery(label);
    setResults([]);
    setSearchError(null);
    setIsSearching(true);
    const token = searchToken.current + 1;
    searchToken.current = token;
    try {
      const found = await searchCategory(shortcut, liveLocationRef.current, new AbortController().signal);
      if (searchToken.current !== token) return;
      setResults(found);
      setSearchError(found.length === 0 ? `No encontramos ${label.toLowerCase()} cerca.` : null);
    } catch {
      if (searchToken.current === token) setSearchError('No pudimos buscar ahora. Revisa tu conexión.');
    } finally {
      if (searchToken.current === token) setIsSearching(false);
    }
  };

  const selectPlace = (place: SearchPlace) =>
    choose({ latitude: place.latitude, longitude: place.longitude, label: place.name });

  if (isSharedRoute) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.sharedWrap}>
          <IconButton icon="close" size={40} onPress={() => router.back()} />
          <View style={styles.sharedBody}>
            <View style={styles.sharedIcon}>
              <Ionicons name="share-social" size={22} color={colors.lime} />
            </View>
            <AppText variant="h1">Ruta compartida.</AppText>
            <AppText variant="body" color={colors.muted} style={{ marginTop: 8 }}>
              Un amigo te compartió este destino. Al aceptarla, tu mapa trazará la
              misma ruta por calles.
            </AppText>
            <View style={styles.sharedCard}>
              <Ionicons name="flag" size={16} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {(Array.isArray(params.label) ? params.label[0] : params.label)?.trim() ||
                    'Destino compartido'}
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {sharedLatitude.toFixed(5)}, {sharedLongitude.toFixed(5)}
                </AppText>
              </View>
            </View>
            <Button
              label="Aceptar ruta"
              icon="checkmark-circle-outline"
              size="lg"
              onPress={acceptSharedRoute}
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const showRecents = !hasQuery && recents.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.searchBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <TextInput
          value={query}
          onChangeText={handleQueryChange}
          placeholder={isStop ? 'Añadir parada: gasolinera, comida…' : '¿A dónde vamos?'}
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          selectionColor={colors.accent}
          style={styles.searchInput}
        />
        {searchingNow ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : query.length > 0 ? (
          <Pressable onPress={() => handleQueryChange('')} hitSlop={10} accessibilityLabel="Borrar">
            <Ionicons name="close-circle" size={20} color={colors.dim} />
          </Pressable>
        ) : null}
      </View>

      {isStop && !hasQuery ? (
        <View style={styles.chips}>
          {STOP_SHORTCUTS.map((shortcut) => (
            <Pressable
              key={shortcut.category}
              onPress={() => void searchShortcut(shortcut.category, shortcut.label)}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Ionicons name={shortcut.icon} size={16} color={colors.text} />
              <AppText variant="bodyStrong" style={{ fontSize: 14 }}>
                {shortcut.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showRecents ? (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={recents}
          keyExtractor={(item, index) => `${item.label}-${index}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <AppText variant="label" color={colors.muted} style={styles.sectionTitle}>
              RECIENTES
            </AppText>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => selectRecent(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Ir a ${item.label}`}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="time-outline" size={18} color={colors.textSoft} />
              </View>
              <AppText variant="bodyStrong" numberOfLines={1} style={styles.rowText}>
                {item.label}
              </AppText>
              <Ionicons name="arrow-up-outline" size={18} color={colors.dim} style={styles.rowArrow} />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={visibleResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name={searchError ? 'alert-circle-outline' : 'search-outline'}
                size={28}
                color={colors.dim}
              />
              <AppText variant="body" color={colors.muted} style={styles.emptyTitle}>
                {searchError ??
                  (hasQuery
                    ? searchingNow
                      ? 'Buscando…'
                      : 'Escribe un poco más.'
                    : 'Busca una calle, un lugar o una ciudad.')}
              </AppText>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => selectPlace(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Ir a ${item.name}`}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="location-outline" size={18} color={colors.textSoft} />
              </View>
              <View style={styles.rowText}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.name}
                </AppText>
                {item.detail ? (
                  <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                    {item.detail}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="caption" color={colors.muted}>
                {formatSearchDistance(item.distanceM)}
              </AppText>
            </Pressable>
          )}
        />
      )}

      <AppText variant="caption" color={colors.dim} style={styles.footer}>
        © OpenStreetMap
      </AppText>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  safe: { flex: 1, backgroundColor: colors.bg },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 17,
    paddingVertical: 0,
  },
  sectionTitle: { marginTop: spacing.md, marginBottom: spacing.xs },
  pressed: { opacity: 0.6 },
  rowArrow: { transform: [{ rotate: '-45deg' }] },
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: { textAlign: 'center' },
  footer: { textAlign: 'center', paddingVertical: spacing.sm },
  sharedWrap: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  sharedBody: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  sharedIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.limeSoft,
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  sharedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
  },
});
