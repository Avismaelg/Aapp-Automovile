import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WorldMap } from '@/src/components/WorldMap';
import { AppText, Avatar, Button, IconButton } from '@/src/components/ui';
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
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import { partyUrl } from '@/src/lib/qr';
import type { RouteInstructionIcon, WorldMapMember, WorldMapMode } from '@/src/lib/map-html';
import {
  cumulativeDistances,
  formatInstructionDistance,
  nextInstruction,
  routeProgress,
} from '@/src/lib/route-instructions';
import { useChosenDestination } from '@/src/store/destination';
import { useParking } from '@/src/store/parking';
import { colors, radius, spacing } from '@/src/theme';

const GLASS = 'rgba(6,8,11,0.74)';

const instructionIcons: Record<RouteInstructionIcon, keyof typeof Ionicons.glyphMap> = {
  straight: 'arrow-up',
  left: 'arrow-back',
  right: 'arrow-forward',
  'slight-left': 'return-up-back',
  'slight-right': 'return-up-forward',
  'sharp-left': 'arrow-back',
  'sharp-right': 'arrow-forward',
  uturn: 'refresh',
  roundabout: 'sync',
  merge: 'git-merge',
  arrive: 'flag',
  depart: 'navigate',
};

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

  const [mode, setMode] = useState<WorldMapMode>('3d');
  const [following, setFollowing] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [mapKey, setMapKey] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<WorldMapMember | null>(null);
  const [recordingNow, setRecordingNow] = useState(() => Date.now());
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [northUp, setNorthUp] = useState(false);

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
  const roadInfo = useRoadInfo(live.location);

  const primaryVehicle = vehicles.find((vehicle) => vehicle.isPrimary) ?? vehicles[0];
  const parkingSpot = useParking((state) => state.spot);
  const clearParking = useParking((state) => state.clearSpot);
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

  // Progreso sobre la ruta y próxima maniobra, como Waze.
  const routeCumulative = useMemo(
    () => (route.route ? cumulativeDistances(route.route.coordinates) : []),
    [route.route],
  );
  const progressM = useMemo(
    () =>
      route.route
        ? (routeProgress(route.route.coordinates, routeCumulative, live.location)?.progressM ?? null)
        : null,
    [route.route, routeCumulative, live.location],
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
    startNavigation();
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
                Alert.alert(
                  'Reto',
                  error instanceof Error ? error.message : 'No pudimos crear el reto.',
                ),
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

  return (
    <View style={styles.root}>
      <WorldMap
        key={mapKey}
        members={mapFriends}
        destination={destination}
        location={live.location}
        parking={
          parkingSpot
            ? { latitude: parkingSpot.latitude, longitude: parkingSpot.longitude }
            : null
        }
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
          <View pointerEvents="box-none" style={styles.navLayer}>
            <View style={styles.navTop}>
              <View style={styles.navInstructionRow}>
                <View style={styles.navInstructionIcon}>
                  <Ionicons
                    name={upcoming ? instructionIcons[upcoming.icon] : 'navigate'}
                    size={24}
                    color="#120802"
                  />
                </View>
                <View style={styles.navInstructionText}>
                  <AppText variant="h2" numberOfLines={2}>
                    {upcoming ? upcoming.text : 'Sigue la ruta'}
                  </AppText>
                  {upcoming?.road && upcoming.icon !== 'arrive' ? (
                    <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                      {upcoming.road}
                    </AppText>
                  ) : null}
                </View>
                {upcoming ? (
                  <AppText variant="h2" color={colors.lime} style={styles.navInstructionDistance}>
                    {formatInstructionDistance(upcoming.remainingM)}
                  </AppText>
                ) : null}
              </View>
              <View style={styles.navMetaRow}>
                <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
                  {routeLine
                    ? `${formatRouteTime(remainingTimeMs ?? route.route?.timeMs ?? 0)} · ${formatRouteDistance(remainingRouteM ?? route.route?.distanceM ?? 0)}${
                        arrivalLabel ? ` · Llegada ${arrivalLabel}` : ''
                      }`
                    : 'Calculando ruta por calles…'}
                </AppText>
                <View style={styles.navMetaDot} />
                <AppText
                  variant="caption"
                  color={colors.muted}
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {destination.label}
                </AppText>
              </View>
            </View>
            <View style={styles.navSpeed}>
              <View style={styles.speedRow}>
                <AppText variant="display" style={styles.navSpeedValue}>
                  {speedLabel}
                </AppText>
                {roadInfo.limitKmh != null ? (
                  <View style={styles.speedLimit}>
                    <AppText variant="label" style={styles.speedLimitText}>
                      {roadInfo.limitKmh}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText variant="label" color={colors.muted}>
                km/h
              </AppText>
            </View>
            <Pressable
              style={[styles.navCompass, northUp && styles.navCompassActive]}
              onPress={() => setNorthUp((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel="Orientar el mapa al norte"
            >
              <AppText variant="label" color={northUp ? '#120802' : colors.text} style={styles.modeText}>
                N
              </AppText>
            </Pressable>
            <View style={styles.navActions}>
              <Pressable
                style={styles.navButtonDark}
                onPress={() => router.push('/destino' as Href)}
                accessibilityRole="button"
                accessibilityLabel="Cambiar ruta"
              >
                <Ionicons name="swap-horizontal" size={18} color={colors.text} />
                <AppText variant="bodyStrong" color={colors.text}>
                  Cambiar ruta
                </AppText>
              </Pressable>
              <Pressable
                style={styles.navButtonLime}
                onPress={clearDestination}
                accessibilityRole="button"
                accessibilityLabel="Cerrar ruta"
              >
                <Ionicons name="close" size={18} color="#120802" />
                <AppText variant="bodyStrong" color="#120802">
                  Cerrar ruta
                </AppText>
              </Pressable>
            </View>
          </View>
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

            <Pressable
              style={styles.searchPill}
              onPress={() => router.push('/destino' as Href)}
              accessibilityRole="button"
              accessibilityLabel="Buscar destino"
            >
              <Ionicons
                name={destination ? 'flag' : 'search'}
                size={16}
                color={destination ? colors.lime : colors.textSoft}
              />
              <AppText
                variant="bodyStrong"
                numberOfLines={1}
                color={destination ? colors.text : colors.textSoft}
                style={styles.searchText}
              >
                {destination ? destination.label : '¿A dónde vamos?'}
              </AppText>
              <Ionicons name="search" size={14} color={colors.muted} />
            </Pressable>

            {destination == null && recentDestinations.length > 0 ? (
              <View style={styles.recentsRow}>
                {recentDestinations.slice(0, 3).map((recent) => (
                  <Pressable
                    key={`${recent.label}-${recent.latitude.toFixed(5)}`}
                    style={styles.recentChip}
                    onPress={() => {
                      useChosenDestination.getState().setDestination(recent);
                      startNavigation();
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
              <View style={styles.speedHud}>
                <View style={styles.speedRow}>
                  <AppText variant="display" style={styles.speedValue}>
                    {speedLabel}
                  </AppText>
                  {roadInfo.limitKmh != null ? (
                    <View style={styles.speedLimit}>
                      <AppText variant="label" style={styles.speedLimitText}>
                        {roadInfo.limitKmh}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.speedMeta}>
                  <View style={[styles.liveDot, !live.isLive && styles.liveDotOff]} />
                  <AppText variant="label" color={colors.muted} style={styles.speedUnit}>
                    km/h · {live.isLive ? 'GPS' : 'DEMO'}
                  </AppText>
                </View>
                {currentStreet ? (
                  <AppText
                    variant="caption"
                    color={colors.textSoft}
                    numberOfLines={1}
                    style={styles.streetName}
                  >
                    {currentStreet}
                  </AppText>
                ) : null}
              </View>

              <View style={styles.controls}>
                <Pressable
                  style={[styles.roundControl, northUp && styles.roundControlLime]}
                  onPress={() => setNorthUp((value) => !value)}
                  accessibilityRole="button"
                  accessibilityLabel="Orientar el mapa al norte"
                >
                  <AppText
                    variant="label"
                    color={northUp ? '#120802' : colors.text}
                    style={styles.modeText}
                  >
                    N
                  </AppText>
                </Pressable>
                <Pressable
                  style={styles.roundControl}
                  onPress={toggleMode}
                  accessibilityRole="button"
                  accessibilityLabel={mode === '3d' ? 'Cambiar a vista 2D' : 'Cambiar a vista 3D'}
                >
                  <AppText variant="label" color={colors.text} style={styles.modeText}>
                    {mode === '3d' ? '3D' : '2D'}
                  </AppText>
                </Pressable>
                {!following ? (
                  <Pressable
                    style={[styles.roundControl, styles.roundControlAccent]}
                    onPress={recenter}
                    accessibilityRole="button"
                    accessibilityLabel="Recentrar mapa"
                  >
                    <Ionicons name="navigate" size={20} color="#120802" />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {destination ? (
              <View style={styles.destinationCard}>
                <View style={styles.destinationRow}>
                  <View style={styles.destinationIcon}>
                    <Ionicons name="flag" size={15} color="#120802" />
                  </View>
                  <View style={styles.destinationText}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {destination.label}
                    </AppText>
                    <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                      {route.isLoading
                        ? 'Buscando ruta por calles…'
                        : routeLine
                          ? `${routeLine} · ${routeSourceLabel}${arrivalLabel ? ` · Llegada ${arrivalLabel}` : ''}`
                          : 'Sin ruta todavía'}
                    </AppText>
                  </View>
                  <IconButton icon="close" size={30} tone="ghost" onPress={clearDestination} />
                </View>
                <View style={styles.destinationActions}>
                  <Button
                    label="Navegar"
                    variant="lime"
                    size="sm"
                    icon="navigate"
                    onPress={startNavigation}
                    style={styles.destinationAction}
                  />
                  <Button
                    label="Compartir ruta"
                    variant="secondary"
                    size="sm"
                    icon="share-social-outline"
                    onPress={shareRouteLink}
                    style={styles.destinationAction}
                  />
                </View>
              </View>
            ) : null}

            {selectedFriend ? (
              <View style={styles.friendSheet}>
                <View style={styles.friendRow}>
                  <Avatar
                    name={selectedFriend.name}
                    color={selectedFriend.color}
                    size={38}
                    online
                    ring={colors.border}
                  />
                  <View style={styles.friendText}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {selectedFriend.name}
                    </AppText>
                    <AppText variant="caption" color={colors.muted}>
                      En el mapa ahora
                    </AppText>
                  </View>
                  <IconButton
                    icon="close"
                    size={30}
                    tone="ghost"
                    onPress={() => setSelectedFriend(null)}
                  />
                </View>
                <View style={styles.destinationActions}>
                  <Button
                    label="Invitar al convoy"
                    variant="lime"
                    size="sm"
                    icon="person-add"
                    onPress={() => void inviteToConvoy()}
                    style={styles.destinationAction}
                  />
                  <Button
                    label="Retar"
                    variant="secondary"
                    size="sm"
                    icon="flag"
                    onPress={() => challengeFriend(selectedFriend)}
                    style={styles.destinationAction}
                  />
                </View>
              </View>
            ) : null}

            <Pressable
              style={styles.attribution}
              hitSlop={6}
              onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}
            >
              <AppText variant="caption" color={colors.dim} style={styles.attributionText}>
                © OpenFreeMap · © OpenMapTiles · © OpenStreetMap · Relieve Mapzen
              </AppText>
            </Pressable>
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
  speedHud: {
    minWidth: 128,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  speedValue: { fontSize: 40, lineHeight: 44 },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  speedLimit: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#ff4d5e',
    backgroundColor: '#f4f6f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedLimitText: { fontSize: 11, color: '#0b0f14' },
  streetName: { marginTop: 2, fontSize: 9, maxWidth: 160 },
  speedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  liveDotOff: { backgroundColor: colors.dim },
  speedUnit: { fontSize: 9 },
  controls: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  roundControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  roundControlAccent: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  roundControlLime: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  navCompass: {
    position: 'absolute',
    right: 0,
    bottom: 96,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,8,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  navCompassActive: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  modeText: { fontSize: 11 },
  destinationCard: {
    backgroundColor: 'rgba(11,15,20,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  destinationIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationText: { flex: 1 },
  destinationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  destinationAction: { flexShrink: 1 },
  friendSheet: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(11,15,20,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.3)',
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  friendText: { flex: 1 },
  navLayer: { flex: 1 },
  navTop: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(6,8,11,0.72)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,255,77,0.25)',
  },
  navInstructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  navInstructionIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navInstructionText: { flex: 1 },
  navInstructionDistance: { fontSize: 22 },
  navMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  navMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.dim,
  },
  navSpeed: {
    position: 'absolute',
    left: 0,
    bottom: 96,
    alignItems: 'center',
    backgroundColor: 'rgba(6,8,11,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  navSpeedValue: { fontSize: 40, lineHeight: 44 },
  navActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
  },
  navButtonDark: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    backgroundColor: 'rgba(6,8,11,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.xl,
  },
  navButtonLime: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    backgroundColor: colors.lime,
    borderRadius: radius.xl,
  },
  attribution: {
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  attributionText: { fontSize: 9 },
});
