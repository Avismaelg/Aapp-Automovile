import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapAttribution } from '@/src/components/MapAttribution';
import { WorldMap } from '@/src/components/WorldMap';
import { DestinationCard, type RouteOption } from '@/src/components/navigation/DestinationCard';
import { FriendSheet } from '@/src/components/navigation/FriendSheet';
import { MapControls } from '@/src/components/navigation/MapControls';
import { NavigationHud } from '@/src/components/navigation/NavigationHud';
import { SpeedHud } from '@/src/components/navigation/SpeedHud';
import { AppText, Avatar } from '@/src/components/ui';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFriendsOnMap } from '@/src/hooks/useFriendsOnMap';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { useGraphHopperRoute } from '@/src/hooks/useGraphHopperRoute';
import { useLiveLocation, refreshStaleLocation } from '@/src/hooks/useLiveLocation';
import { useMapTheme } from '@/src/hooks/useMapTheme';
import { useParkingDetector, distanceToSpotMeters } from '@/src/hooks/useParkingDetector';
import { useRoadInfo } from '@/src/hooks/useRoadInfo';
import { useActiveParty } from '@/src/hooks/useParty';
import { useCreateChallenge } from '@/src/hooks/useChallenges';
import { useTripRecorder } from '@/src/hooks/useTripRecorder';
import { useVoiceGuidance } from '@/src/hooks/useVoiceGuidance';
import { showError } from '@/src/lib/alerts';
import { buildDrivingLine } from '@/src/lib/driving-line';
import { haversineMeters } from '@/src/lib/geo';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import { partyUrl } from '@/src/lib/qr';
import type { WorldMapAlternative, WorldMapMember } from '@/src/lib/map-html';
import {
  cumulativeDistances,
  followingInstruction,
  nextInstruction,
  routeProgress,
} from '@/src/lib/route-instructions';
import { useChosenDestination } from '@/src/store/destination';
import { useParking } from '@/src/store/parking';
import { DAY_CHROME, MapChromeContext, NIGHT_CHROME } from '@/src/components/navigation/glass';
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

  const [voiceMuted, setVoiceMuted] = useState(false);
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
  // posición y deja el coche fijo en el aparcamiento.
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
  const fastestTimeMs = route.routes[0]?.timeMs ?? 0;
  const routeOptions = useMemo<RouteOption[]>(
    () =>
      route.routes.map((option) => ({
        timeLabel: formatRouteTime(option.timeMs),
        distanceLabel: formatRouteDistance(option.distanceM),
        extraMinutes: Math.max(0, Math.round((option.timeMs - fastestTimeMs) / 60_000)),
      })),
    [route.routes, fastestTimeMs],
  );
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
  const thenInstruction = useMemo(
    () => followingInstruction(route.route?.instructions, upcoming),
    [route.route, upcoming],
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

  // Muestra el coche aparcado en el mapa (sin navegar).
  const [parkingFocus, setParkingFocus] = useState<{ latitude: number; longitude: number; token: number } | null>(null);
  const showParkedCar = () => {
    if (!parkingSpot) return;
    setParkingFocus({ latitude: parkingSpot.latitude, longitude: parkingSpot.longitude, token: Date.now() });
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

  // Antes de salir se ven las alternativas en gris; durante la navegación,
  // solo la ruta elegida.
  const mapAlternatives = useMemo<WorldMapAlternative[]>(
    () =>
      navigating
        ? []
        : route.routes
            .map((option, index) => ({ index, coordinates: option.coordinates }))
            .filter((option) => option.index !== route.selected),
    [navigating, route.routes, route.selected],
  );
  const selectRoute = route.select;

  useVoiceGuidance({
    upcoming: offRoute ? null : upcoming,
    enabled: navigating && !voiceMuted,
    speedKmh: live.location.speedKmh ?? null,
  });

  // Llegada: a menos de 40 m del destino (o al final de la ruta) se termina
  // la navegación sola y se avisa, como Waze.
  const [arrivedLabel, setArrivedLabel] = useState<string | null>(null);
  const destinationDistanceM = destination ? haversineMeters(live.location, destination) : null;
  const arrived =
    navigating &&
    destination != null &&
    ((destinationDistanceM != null && destinationDistanceM < 40) ||
      (remainingRouteM != null && remainingRouteM < 20 && (routeDistanceFromPathM ?? 999) < 40));
  useEffect(() => {
    if (!arrived || !destination) return;
    const label = destination.label;
    // Fuera del cuerpo del efecto: terminar la ruta re-renderiza la pantalla.
    const timer = setTimeout(() => {
      setArrivedLabel(label);
      useChosenDestination.getState().stopNavigation();
      clearChosenDestination();
      // La guía por voz se calla al terminar la ruta: el aviso va después.
      if (!voiceMuted) {
        setTimeout(() => Speech.speak(`Has llegado a ${label}`, { language: 'es-ES' }), 600);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [arrived, destination, voiceMuted, clearChosenDestination]);
  useEffect(() => {
    if (!arrivedLabel) return;
    const timer = setTimeout(() => setArrivedLabel(null), 8_000);
    return () => clearTimeout(timer);
  }, [arrivedLabel]);

  const beginNavigation = useCallback(() => {
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

  const [bottomHeight, setBottomHeight] = useState(0);

  // Línea de conducción por delante (azul, amarillo, rojo según la velocidad
  // a la que se puede tomar cada tramo), solo navegando en coche.
  const speedKmhNow = Math.round(live.location.speedKmh ?? 0);
  const drivingLine = useMemo(
    () =>
      navigating && !walking && route.route && progressState && !offRoute
        ? buildDrivingLine(route.route.coordinates, progressState.nearestIndex, speedKmhNow, roadInfo.limitKmh ?? null)
        : null,
    [navigating, walking, route.route, progressState, offRoute, speedKmhNow, roadInfo.limitKmh],
  );

  // Los controles se ven claros sobre el mapa de día y oscuros de noche.
  const chrome = useMapTheme(live.location) === 'day' ? DAY_CHROME : NIGHT_CHROME;
  const parkingTint = chrome.day ? '#0891b2' : colors.cyan;

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
        alternatives={mapAlternatives}
        onAlternativePress={selectRoute}
        vehicleColor={primaryVehicle?.color}
        vehicleKind={primaryVehicle?.kind}
        recenterToken={recenterToken}
        focus={parkingFocus}
        drivingLine={drivingLine?.data ?? null}
        ornamentBottom={navigating ? 4 : bottomHeight + spacing.md + 6}
        onFollowChange={handleFollowChange}
        onMemberPress={handleFriendPress}
        onError={handleMapError}
        style={StyleSheet.absoluteFill}
      />

      <MapChromeContext.Provider value={chrome}>
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
            following={thenInstruction}
            offRoute={offRoute}
            hasRoute={Boolean(routeLine)}
            arrivalLabel={arrivalLabel}
            remainingTimeLabel={formatRouteTime(remainingTimeMs ?? route.route?.timeMs ?? 0)}
            remainingDistanceLabel={formatRouteDistance(remainingRouteM ?? route.route?.distanceM ?? 0)}
            destinationLabel={destination.label}
            speedLabel={speedLabel}
            limitKmh={roadInfo.limitKmh ?? null}
            curve={drivingLine?.nextCurve ?? null}
            northUp={northUp}
            muted={voiceMuted}
            bottomInset={insets.bottom}
            onToggleNorth={toggleNorthUp}
            onToggleMute={() => setVoiceMuted((value) => !value)}
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
              <Pressable style={[styles.vehiclePill, chrome.surface]} onPress={() => router.push('/(tabs)/garage')}>
                <Ionicons name="car-sport" size={16} color={colors.accent} />
                <AppText variant="bodyStrong" color={chrome.text} numberOfLines={1} style={styles.vehicleText}>
                  {vehicleLabel}
                </AppText>
                <Ionicons name="chevron-down" size={14} color={chrome.muted} />
              </Pressable>
              <Pressable
                style={[styles.roundButton, chrome.surface]}
                onPress={() => router.push('/actividad' as Href)}
                accessibilityRole="button"
                accessibilityLabel="Actividad"
              >
                <Ionicons name="newspaper-outline" size={19} color={chrome.text} />
              </Pressable>
            </View>

            {destination == null ? (
              <Pressable
                style={[styles.searchPill, chrome.surface]}
                onPress={() => router.push('/destino' as Href)}
                accessibilityRole="button"
                accessibilityLabel="Buscar destino"
              >
                <Ionicons name="search" size={19} color="#2f8cff" />
                <AppText
                  variant="bodyStrong"
                  numberOfLines={1}
                  color={chrome.muted}
                  style={styles.searchText}
                >
                  ¿A dónde vamos?
                </AppText>
              </Pressable>
            ) : null}

            {destination == null && recentDestinations.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.recentsScroll}
                contentContainerStyle={styles.recentsRow}
              >
                {recentDestinations.slice(0, 5).map((recent) => (
                  <Pressable
                    key={`${recent.label}-${recent.latitude.toFixed(5)}`}
                    style={[styles.recentChip, chrome.surface]}
                    onPress={() => {
                      useChosenDestination.getState().setDestination(recent);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Ir a ${recent.label}`}
                  >
                    <Ionicons name="time-outline" size={13} color={chrome.muted} />
                    <AppText
                      variant="caption"
                      color={chrome.textSoft}
                      numberOfLines={1}
                      style={styles.recentChipText}
                    >
                      {recent.label}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {arrivedLabel ? (
              <View style={[styles.banner, chrome.surface, styles.arrivedBanner]}>
                <Ionicons name="flag" size={18} color="#16a34a" />
                <AppText variant="bodyStrong" color={chrome.text} numberOfLines={2} style={styles.bannerText}>
                  Has llegado a {arrivedLabel}
                </AppText>
                <Pressable onPress={() => setArrivedLabel(null)} hitSlop={8} accessibilityLabel="Cerrar aviso">
                  <Ionicons name="close" size={18} color={chrome.muted} />
                </Pressable>
              </View>
            ) : null}

            {activeTrip ? (
              <View style={[styles.recordingPill, chrome.surface]}>
                <View style={styles.recordingDot} />
                <AppText variant="caption" color={chrome.textSoft}>
                  Grabando ruta ·{' '}
                  {Math.max(1, Math.round((recordingNow - activeTrip.startedAt) / 60_000))} min ·{' '}
                  {(activeTrip.distanceM / 1000).toFixed(1).replace('.', ',')} km
                </AppText>
              </View>
            ) : null}

            {showParking && parkingSpot ? (
              <View style={[styles.parkingPill, chrome.surface, { borderColor: parkingTint }]}>
                <Pressable
                  style={styles.parkingShow}
                  onPress={showParkedCar}
                  onLongPress={() =>
                    Alert.alert('Coche aparcado', '¿Olvidar la ubicación guardada?', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Olvidar', style: 'destructive', onPress: clearParking },
                    ])
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Ver mi coche aparcado en el mapa"
                >
                  <Ionicons name="car" size={15} color={parkingTint} />
                  <AppText
                    variant="caption"
                    color={chrome.textSoft}
                    style={styles.parkingText}
                    numberOfLines={1}
                  >
                    Tu coche aparcado · {formatParkingDistance(parkingDistance)}
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={goToParkedCar}
                  hitSlop={8}
                  style={styles.parkingGo}
                  accessibilityRole="button"
                  accessibilityLabel="Ir a mi coche aparcado"
                >
                  <Ionicons name="navigate" size={14} color={parkingTint} />
                </Pressable>
              </View>
            ) : null}

            {!live.isLive ? (
              <View style={[styles.banner, chrome.surface]}>
                <View style={styles.bannerDot} />
                <AppText variant="caption" color={chrome.textSoft} numberOfLines={2} style={styles.bannerText}>
                  {live.message}
                </AppText>
                {live.status !== 'locating' ? (
                  <Pressable onPress={live.retry} hitSlop={8}>
                    <AppText variant="label" color={chrome.day ? '#2f8cff' : colors.lime} style={styles.retryText}>
                      REINTENTAR
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {mapError ? (
              <View style={[styles.banner, chrome.surface, styles.bannerError]}>
                <Ionicons name="warning-outline" size={16} color={colors.accent} />
                <AppText variant="caption" color={chrome.textSoft} numberOfLines={2} style={styles.bannerText}>
                  {mapError}
                </AppText>
                <Pressable onPress={retryMap} hitSlop={8}>
                  <AppText variant="label" color={chrome.day ? '#2f8cff' : colors.lime} style={styles.retryText}>
                    REINTENTAR
                  </AppText>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.spacer} pointerEvents="none" />

            <View
              pointerEvents="box-none"
              style={styles.bottomCluster}
              onLayout={(event) => setBottomHeight(Math.round(event.nativeEvent.layout.height))}
            >
            <View style={styles.sideRow}>
              <SpeedHud
                speedLabel={speedLabel}
                limitKmh={roadInfo.limitKmh ?? null}
                isLive={live.isLive}
                street={currentStreet ?? null}
              />

              <MapControls
                northUp={northUp}
                following={following}
                onToggleNorth={toggleNorthUp}
                onRecenter={recenter}
              />
            </View>

            {destination ? (
              <DestinationCard
                label={destination.label}
                status={destinationStatus}
                options={routeOptions}
                selected={route.selected}
                onSelect={selectRoute}
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

            </View>

            <MapAttribution style={styles.attribution} />
          </>
        )}
      </View>
      </MapChromeContext.Provider>
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
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  vehicleText: { flex: 1 },
  roundButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  arrivedBanner: { borderColor: '#16a34a', borderWidth: 1.5 },
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
    minHeight: 50,
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
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  recentChipText: { flexShrink: 1 },
  recentsScroll: { marginTop: spacing.xs, marginHorizontal: -spacing.lg, flexGrow: 0 },
  recentsRow: { gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 180,
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
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    paddingRight: 4,
    paddingVertical: 4,
  },
  parkingShow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, paddingVertical: 2 },
  parkingText: { flexShrink: 1 },
  parkingGo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,225,255,0.16)',
  },
  spacer: { flex: 1 },
  bottomCluster: { gap: 0 },
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
