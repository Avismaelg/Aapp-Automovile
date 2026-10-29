import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, IconButton, Input } from '@/src/components/ui';
import { useLiveLocation } from '@/src/hooks/useLiveLocation';
import {
  formatSearchDistance,
  searchPlaces,
  type SearchPlace,
} from '@/src/lib/place-search';
import { useChosenDestination } from '@/src/store/destination';
import { colors, radius, spacing } from '@/src/theme';

export default function DestinationScreen() {
  const live = useLiveLocation();
  const setDestination = useChosenDestination((state) => state.setDestination);
  const startNavigation = useChosenDestination((state) => state.startNavigation);
  const params = useLocalSearchParams<{ lat?: string; lng?: string; label?: string }>();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchToken = useRef(0);
  const liveLocationRef = useRef(live.location);

  const hasQuery = query.trim().length >= 3;
  const visibleResults = hasQuery ? results : [];
  const searchingNow = hasQuery && isSearching;

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setResults([]);
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
    if (trimmed.length < 3) return;

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
  }, [query]);

  const selectPlace = (place: SearchPlace) => {
    setDestination({
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.name,
    });
    router.replace('/');
  };

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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="arrow-back" size={40} onPress={() => router.back()} />
        <AppText variant="label" color={colors.accent}>
          ¿A DÓNDE VAMOS?
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrap}>
        <Input
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Calle, ciudad o sitio… ej. Pico Duarte"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          rightSlot={
            searchingNow ? (
              <AppText variant="caption" color={colors.dim} style={{ paddingHorizontal: 10 }}>
                …
              </AppText>
            ) : (
              <Ionicons name="search" size={18} color={colors.dim} style={{ paddingHorizontal: 12 }} />
            )
          }
        />
      </View>

      <FlatList
        keyboardShouldPersistTaps="handled"
        data={visibleResults}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={searchError ? 'alert-circle-outline' : 'compass-outline'}
              size={30}
              color={colors.dim}
            />
            <AppText variant="body" color={colors.muted} style={styles.emptyTitle}>
              {searchError ??
                (hasQuery
                  ? searchingNow
                    ? 'Buscando lugares…'
                    : 'Escribe más letras o prueba otra palabra.'
                  : 'Busca una calle, ciudad o sitio. La ruta se traza por calles reales.')}
            </AppText>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => selectPlace(item)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Ir a ${item.name}`}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="location-outline" size={16} color={colors.accent} />
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

      <View style={styles.footer}>
        <AppText variant="caption" color={colors.dim}>
          Búsqueda: Photon/Komoot · Datos © OpenStreetMap
        </AppText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  searchWrap: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
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
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
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
