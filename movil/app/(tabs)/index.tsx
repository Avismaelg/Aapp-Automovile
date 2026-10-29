import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapAttribution } from '@/src/components/MapAttribution';
import { WorldMap } from '@/src/components/WorldMap';
import { DestinationCard } from '@/src/components/navigation/DestinationCard';
import { FriendSheet } from '@/src/components/navigation/FriendSheet';
import { MapControls } from '@/src/components/navigation/MapControls';
import { NavigationHud } from '@/src/components/navigation/NavigationHud';
import { SpeedHud } from '@/src/components/navigation/SpeedHud';
import { AppText, Avatar, IconButton } from '@/src/components/ui';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFriendsOnMap } from '@/src/hooks/useFriendsOnMap';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { useGraphHopperRoute } from '@/src/hooks/useGraphHopperRoute';
import { useLiveLocation, refreshStaleLocation } from '@/src/hooks/useLiveLocation';
import { useParkingDetector, distanceToSpotMeters } from '@/src/hooks/useParkingDetector';
import { useRoadInfo } from '@/src/hooks/useRoadInfo';
import { useActiveParty } from '@/src/hooks/useParty';
import { useCreateChallenge } from '@/src/hooks/useChallenges';
import { useTripRecorder } from '@/src/hooks/useTripRecorder';
import { showError } from '@/src/lib/alerts';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import { partyUrl } from '@/src/lib/qr';
import type { WorldMapMember, WorldMapMode } from '@/src/lib/map-html';
import {
  cumulativeDistances,
  nextInstruction,
  routeProgress,
} from '@/src/lib/route-instructions';
import { useChosenDestination } from '@/src/store/destination';
import { useParking } from '@/src/store/parking';
import { GLASS } from '@/src/components/navigation/glass';
import { colors, radius, spacing } from '@/src/theme';

function formatParkingDistance(meters: number | null) {
  if (meters == null) return 'aquí cerca';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

// Pantalla inicial personal, estilo Waze: tu coche, tu destino y tus amigos
// en el mapa para invitarlos al convoy o retarlos. Sin elementos de party.
export default function NavigationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useCurrentUser();
  const live = useLiveLocation();
  const { party, isDemo } = useActiveParty();
  const { vehicles } = useGarageVehicles();
  const { members: mapFriends } = useFriendsOnMap();
  const createChallenge = useCreateChallenge();

  // El modo 2D es la opción fluida para el arranque; el usuario puede activar
  // 3D bajo demanda desde el control del mapa sin pagar ese coste siempre.
  const [mode, setMode] = useState<WorldMapMode>('2d');
  const [following, setFollowing] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [mapKey, setMapKey] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<WorldMapMember | null>(null);
  const [recordingNow, setRecordingNow] = useState(() => Date.now());
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [northUp, setNorthUp] = useState(false);
  const lastRerouteAtRef = useRef(0);

  const chosenDestination = useChosenDestination((state) => state.destination);
  const clearChosenDestination = useChosenDestination((state) => state.clearDestination);
  const recentDestinations = useChosenDestination((state) => state.recents);
  const isNavigating = useChosenDestination((state) => state.isNavigating);
  const startNavigation = useChosenDestination((state) => state.startNavigation);

  const destination = chosenDestination;

  const route = useGraphHopperRoute({
    origin: live.location,
    destination: destination ?? live.location,
    enabled: Boolean(destination),
  });
  const retryRoute = route.retry;
  const roadInfo = useRoadInfo(live.location);

  const primaryVehicle = vehicles.find((vehicle) => vehicle.isPrimary) ?? vehicles[0];
  const parkingSpot = useParking((state) => state.spot);
  const clearParking = useParking((state) => state.clearSpot);
  const mapParking = useMemo(
    () =>
      parkingSpot
        ? { latitude: parkingSpot.latitude, longitude: parkingSpot.longitude }
        : null,
    [parkingSpot],
  );
  useParkingDetector(live.location);
  const parkingDistance = distanceToSpotMeters(live.location, parkingSpot);
  const showParking =
    Boolean(parkingSpot) && parkingDistance != null && parkingDistance > 40;
  // Con el coche aparcado y caminando, el mapa muestra un peatón en tu
  // posición y deja el coche 3D fijo en el aparcamiento.
  const walking =
    Boolean(parkingSpot) &&
    parkingDistance != null &&
    parkingDistance > 25 &&
    (live.location.speedKmh ?? 0) < 8;
  const vehicleName = primaryVehicle
    ? `${primaryVehicle.make} ${primaryVehicle.model}`
    : undefined;
  const { active: activeTrip } = useTripRecorder(live.location, vehicleName, { walking });
  const vehicleLabel = primaryVehicle
    ? primaryVehicle.nickname.trim() || `${primaryVehicle.make} ${primaryVehicle.model}`
    : 'Añade tu vehículo';
  const speedLabel =
    live.location.speedKmh == null ? '--' : String(Math.round(live.location.speedKmh));
  const routeLine = route.route
    ? `${formatRouteDistance(route.route.distanceM)} · ${formatRouteTime(route.route.timeMs)}`
    : null;
  const routeSourceLabel = route.route
    ? route.route.source === 'graphhopper'
      ? 'GraphHopper'
      : route.route.source === 'osrm'
        ? 'Calles OSM'
        : 'Ruta directa'
    : null;

  // Progreso sobre la ruta y próxima maniobra, como Waze. Se recalcula solo
  // cuando cambia la posición, no en cada actualización de rumbo.
  const latitude = live.location.latitude;
  const longitude = live.location.longitude;
  const routeCumulative = useMemo(
    () => (route.route ? cumulativeDistances(route.route.coordinates) : []),
    [route.route],
  );
  const progressState = useMemo(
    () =>
      route.route
        ? routeProgress(route.route.coordinates, routeCumulative, { latitude, longitude })
        : null,
    [route.route, routeCumulative, latitude, longitude],
  );
  const progressM = progressState?.progressM ?? null;
  const routeDistanceFromPathM = progressState?.distanceM ?? null;
  const offRoute = Boolean(
    route.route && routeDistanceFromPathM != null && routeDistanceFromPathM > 80,
  );
  const upcoming = useMemo(
    () => nextInstruction(route.route?.instructions, progressM),
    [route.route, progressM],
  );
  const remainingRouteM =
    route.route && progressM != null ? Math.max(0, route.route.distanceM - progressM) : null;
  const remainingTimeMs =
    route.route && remainingRouteM != null && route.route.distanceM > 0
      ? route.route.timeMs * (remainingRouteM / route.route.distanceM)
      : null;

  // Calle actual: la del tramo de la ruta o, sin ruta, la que reporta OSM.
  const currentStreet = useMemo(() => {
    const list = route.route?.instructions;
    if (!list || progressM == null) return roadInfo.roadName;
    let current = list[0];
    for (const item of list) {
      if (item.atDistanceM <= progressM + 5) current = item;
      else break;
    }
    return current?.road ?? roadInfo.roadName;
  }, [route.route, progressM, roadInfo.roadName]);

  const handleFollowChange = useCallback((value: boolean) => setFollowing(value), []);
  const handleMapError = useCallback((message: string) => setMapError(message), []);

  // Al abrir la app, volver a ella o entrar a Inicio, el mapa siempre sigue tu
  // posición otra vez (aunque hayas arrastrado el mapa antes) y pide una
  // posición fresca si la anterior quedó vieja en segundo plano.
  const ensureFollowing = useCallback(() => {
    refreshStaleLocation();
    setFollowing(true);
    setRecenterToken((value) => value + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      ensureFollowing();
    }, [ensureFollowing]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') ensureFollowing();
    });
    return () => subscription.remove();
  }, [ensureFollowing]);

  // Al elegir una ruta (o cambiar de destino) la cámara se centra en el coche.
  const destinationKey = destination
    ? `${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`
    : null;

  useEffect(() => {
    if (!destinationKey) return;
    const timer = setTimeout(() => ensureFollowing(), 0);
    return () => clearTimeout(timer);
  }, [destinationKey, ensureFollowing]);

  useEffect(() => {
    if (isNavigating && !destination) {
      useChosenDestination.getState().stopNavigation();
    }
  }, [isNavigating, destination]);

  useEffect(() => {
    if (!activeTrip) return;
    const timer = setInterval(() => setRecordingNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [activeTrip]);

  // Hora de llegada estimada (se refresca cada 30 s, como Google Maps).
  useEffect(() => {
    if (!route.route) return;
    const immediate = setTimeout(() => setClockNow(Date.now()), 0);
    const timer = setInterval(() => setClockNow(Date.now()), 30_000);
    return () => {
      clearTimeout(immediate);
      clearInterval(timer);
    };
  }, [route.route]);

  const arrivalLabel =
    route.route && remainingTimeMs != null
      ? new Date(clockNow + remainingTimeMs).toLocaleTimeString('es-DO', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;
  const remainingLabel = `${formatRouteTime(remainingTimeMs ?? route.route?.timeMs ?? 0)} · ${formatRouteDistance(
    remainingRouteM ?? route.route?.distanceM ?? 0,
  )}${arrivalLabel ? ` · Llegada ${arrivalLabel}` : ''}`;
  const destinationStatus = route.error
    ? route.error
    : route.isLoading
      ? 'Buscando ruta por calles…'
      : routeLine
        ? `${routeLine} · ${routeSourceLabel}${arrivalLabel ? ` · Llegada ${arrivalLabel}` : ''}`
        : 'Sin ruta todavía';

  const toggleNorthUp = () => setNorthUp((value) => !value);

  const recenter = () => {
    setFollowing(true);
    setRecenterToken((value) => value + 1);
  };

  const toggleMode = () => setMode((value) => (value === '3d' ? '2d' : '3d'));

  const retryMap = () => {
    setMapError(null);
    setFollowing(true);
    setMapKey((value) => value + 1);
  };

  const shareRouteLink = async () => {
    if (!destination) return;
    const { latitude, longitude, label } = destination;
    const deepLink = `caravana://destino?lat=${latitude}&lng=${longitude}&label=${encodeURIComponent(label)}`;
    const mapLink = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
    try {
      await Share.share({
        message: `Ruta de Caravana → ${label}\n${mapLink}\nÁbrela en la app: ${deepLink}`,
        url: deepLink,
      });
    } catch {
      // El usuario canceló o la plataforma no soporta compartir.
    }
  };

  const clearDestination = () => {
    clearChosenDestination();
  };

  const goToParkedCar = () => {
    if (!parkingSpot) return;
    useChosenDestination.getState().setDestination({
      latitude: parkingSpot.latitude,
      longitude: parkingSpot.longitude,
      label: 'Mi coche',
    });
    beginNavigation();
  };

  // Acciones sobre un amigo visto en el mapa.
  const inviteToConvoy = async () => {
    if (isDemo || !party?.code) {
      Alert.alert(
        'Convoy',
        isDemo
          ? 'Los convoys reales requieren una cuenta conectada. Crea una party en la pestaña Party.'
          : 'Primero crea o únete a una party en la pestaña Party.',
      );
      return;
    }
    await Share.share({
      message: `Únete a mi convoy en Caravana: ${partyUrl(party.code)}`,
      url: partyUrl(party.code),
    });
  };

  const challengeFriend = (friend: WorldMapMember) => {
    if (isDemo) {
      Alert.alert('Retos', 'Los retos reales requieren una cuenta conectada.');
      return;
    }
    Alert.alert(
      `Reto a ${friend.name.split(' ')[0]}`,
      'Reto por llegada: gana quien llegue primero al destino, respetando las leyes.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reto',
          style: 'destructive',
          onPress: () => {
            void createChallenge
              .mutateAsync({
                title: `Reto: ${friend.name.split(' ')[0]}`,
                category: 'mixed',
                mode: 'instant',
                fromLabel: 'Mi ubicación',
                toLabel: destination?.label ?? 'Meta libre',
                distanceKm: (route.route?.distanceM ?? 0) / 1000,
                rules: 'Por llegada: gana quien llegue primero respetando las leyes.',
                hostVehicleId: primaryVehicle?.id,
                hostVehicleKind: primaryVehicle?.kind ?? 'car',
                invitees: [{ userId: friend.id, vehicleKind: 'car' }],
              })
              .then(() => Alert.alert('Reto enviado', 'Verás la respuesta en la pestaña Retos.'))
              .catch((error: unknown) =>
                showError('Reto', error, 'No pudimos crear el reto.'),
              );
          },
        },
      ],
    );
  };

  const handleFriendPress = useCallback(
    (id: string) => {
      const friend = mapFriends.find((member) => member.id === id) ?? null;
      setSelectedFriend(friend);
    },
    [mapFriends],
  );

  const navigating = isNavigating && Boolean(destination);

  const beginNavigation = useCallback(() => {
    setMode('3d');
    setFollowing(true);
    setRecenterToken((value) => value + 1);
    startNavigation();
  }, [startNavigation]);

  useEffect(() => {
    if (!navigating || !offRoute || route.isLoading) return;
    const now = Date.now();
    if (now - lastRerouteAtRef.current < 15_000) return;
    lastRerouteAtRef.current = now;
    retryRoute();
  }, [navigating, offRoute, retryRoute, route.isLoading]);

  return (
    <View style={styles.root}>
      <WorldMap
        key={mapKey}
        members={mapFriends}
        destination={destination}
        location={live.location}
        parking={mapParking}
        travelMode={walking ? 'walking' : 'car'}
        northUp={northUp}
        route={route.route}
        mode={mode}
        vehicleColor={primaryVehicle?.color}
        vehicleKind={primaryVehicle?.kind}
        recenterToken={recenterToken}
        onFollowChange={handleFollowChange}
        onMemberPress={handleFriendPress}
        onError={handleMapError}
        style={StyleSheet.absoluteFill}
      />

      <View
        pointerEvents="box-none"
        style={[
          styles.overlay,
          { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md },
        ]}
      >
        {navigating && destination ? (
          <NavigationHud
            upcoming={upcoming ?? null}
            offRoute={offRoute}
            hasRoute={Boolean(routeLine)}
            remainingLabel={remainingLabel}
            destinationLabel={destination.label}
            speedLabel={speedLabel}
            limitKmh={roadInfo.limitKmh ?? null}
            northUp={northUp}
            bottomInset={insets.bottom}
            onToggleNorth={toggleNorthUp}
            onChangeRoute={() => router.push('/destino' as Href)}
            onClose={clearDestination}
          />
        ) : (
          <>
            <View style={styles.topRow}>
              <Pressable onPress={() => router.push('/(tabs)/profile')} hitSlop={6}>
                <Avatar
                  name={me.name}
                  color={me.color}
                  size={42}
                  uri={me.avatarUrl}
                  ring={colors.border}
                  online={live.isLive}
                />
              </Pressable>
              <Pressable style={styles.vehiclePill} onPress={() => router.push('/(tabs)/garage')}>
                <Ionicons name="car-sport" size={16} color={colors.accent} />
                <AppText variant="bodyStrong" numberOfLines={1} style={styles.vehicleText}>
                  {vehicleLabel}
                </AppText>
                <Ionicons name="chevron-down" size={14} color={colors.muted} />
              </Pressable>
              <IconButton
                icon="newspaper-outline"
                size={42}
                onPress={() => router.push('/actividad' as Href)}
              />
            </View>

            {destination == null ? (
              <Pressable
                style={styles.searchPill}
                onPress={() => router.push('/destino' as Href)}
                accessibilityRole="button"
                accessibilityLabel="Buscar destino"
              >
                <Ionicons name="search" size={16} color={colors.textSoft} />
                <AppText
                  variant="bodyStrong"
                  numberOfLines={1}
                  color={colors.textSoft}
                  style={styles.searchText}
                >
                  ¿A dónde vamos?
                </AppText>
                <Ionicons name="search" size={14} color={colors.muted} />
              </Pressable>
            ) : null}

            {destination == null && recentDestinations.length > 0 ? (
              <View style={styles.recentsRow}>
                {recentDestinations.slice(0, 3).map((recent) => (
                  <Pressable
                    key={`${recent.label}-${recent.latitude.toFixed(5)}`}
                    style={styles.recentChip}
                    onPress={() => {
                      useChosenDestination.getState().setDestination(recent);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Ir a ${recent.label}`}
                  >
                    <Ionicons name="time-outline" size={11} color={colors.muted} />
                    <AppText
                      variant="caption"
                      color={colors.textSoft}
                      numberOfLines={1}
                      style={styles.recentChipText}
                    >
                      {recent.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {activeTrip ? (
              <View style={styles.recordingPill}>
                <View style={styles.recordingDot} />
                <AppText variant="caption" color={colors.textSoft}>
                  Grabando ruta ·{' '}
                  {Math.max(1, Math.round((recordingNow - activeTrip.startedAt) / 60_000))} min ·{' '}
                  {(activeTrip.distanceM / 1000).toFixed(1).replace('.', ',')} km
                </AppText>
              </View>
            ) : null}

            {showParking && parkingSpot ? (
              <Pressable
                style={styles.parkingPill}
                onPress={goToParkedCar}
                onLongPress={() =>
                  Alert.alert('Coche aparcado', '¿Olvidar la ubicación guardada?', [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Olvidar', style: 'destructive', onPress: clearParking },
                  ])
                }
                accessibilityRole="button"
                accessibilityLabel="Ir a mi coche aparcado"
              >
                <Ionicons name="car" size={15} color={colors.cyan} />
                <AppText
                  variant="caption"
                  color={colors.textSoft}
                  style={styles.parkingText}
                  numberOfLines={1}
                >
                  Tu coche aparcado · {formatParkingDistance(parkingDistance)}
                </AppText>
                <Ionicons name="navigate" size={14} color={colors.cyan} />
              </Pressable>
            ) : null}

            {!live.isLive ? (
              <View style={styles.banner}>
                <View style={styles.bannerDot} />
                <AppText variant="caption" color={colors.textSoft} numberOfLines={2} style={styles.bannerText}>
                  {live.message}
                </AppText>
                {live.status !== 'locating' ? (
                  <Pressable onPress={live.retry} hitSlop={8}>
                    <AppText variant="label" color={colors.lime} style={styles.retryText}>
                      REINTENTAR
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {mapError ? (
              <View style={[styles.banner, styles.bannerError]}>
                <Ionicons name="warning-outline" size={16} color={colors.accent} />
                <AppText variant="caption" color={colors.textSoft} numberOfLines={2} style={styles.bannerText}>
                  {mapError}
                </AppText>
                <Pressable onPress={retryMap} hitSlop={8}>
                  <AppText variant="label" color={colors.lime} style={styles.retryText}>
                    REINTENTAR
                  </AppText>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.spacer} pointerEvents="none" />

            <View style={styles.sideRow}>
              <SpeedHud
                speedLabel={speedLabel}
                limitKmh={roadInfo.limitKmh ?? null}
                isLive={live.isLive}
                street={currentStreet ?? null}
              />

              <MapControls
                northUp={northUp}
                mode={mode}
                following={following}
                onToggleNorth={toggleNorthUp}
                onToggleMode={toggleMode}
                onRecenter={recenter}
              />
            </View>

            {destination ? (
              <DestinationCard
                label={destination.label}
                status={destinationStatus}
                canConfirm={!route.isLoading && Boolean(route.route)}
                onConfirm={beginNavigation}
                onShare={() => void shareRouteLink()}
                onClose={clearDestination}
              />
            ) : null}

            {selectedFriend ? (
              <FriendSheet
                friend={selectedFriend}
                onInvite={() => void inviteToConvoy()}
                onChallenge={() => challengeFriend(selectedFriend)}
                onClose={() => setSelectedFriend(null)}
              />
            ) : null}

            <MapAttribution style={styles.attribution} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vehiclePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 42,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  vehicleText: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerError: { borderColor: 'rgba(255,90,31,0.4)' },
  bannerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  bannerText: { flex: 1 },
  retryText: { fontSize: 9 },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 44,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  searchText: { flex: 1 },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  recentChipText: { flexShrink: 1 },
  recentsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '48%',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  recordingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.lime,
  },
  parkingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(77,225,255,0.4)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  parkingText: { flexShrink: 1 },
  spacer: { flex: 1 },
  sideRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  attribution: {
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
});
