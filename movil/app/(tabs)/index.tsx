import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MapAttribution } from "@/src/components/MapAttribution";
import {
  EARTH_MS,
  EARTH_START_MS,
  FLIGHT_MS,
  FLIGHT_START_MS,
  GalaxyIntro,
} from "@/src/components/intro/GalaxyIntro";
import { buildGreeting, takeFirstWelcome } from "@/src/lib/welcome";
import { useTrips } from "@/src/store/trips";
import { WorldMap } from "@/src/components/WorldMap";
import {
  DestinationCard,
  type RouteOption,
} from "@/src/components/navigation/DestinationCard";
import { FriendSheet } from "@/src/components/navigation/FriendSheet";
import { MapControls } from "@/src/components/navigation/MapControls";
import { NavigationHud } from "@/src/components/navigation/NavigationHud";
import { SpeedHud } from "@/src/components/navigation/SpeedHud";
import { AppText, Avatar } from "@/src/components/ui";
import { useCurrentUser } from "@/src/hooks/useCurrentUser";
import { useFriendsOnMap } from "@/src/hooks/useFriendsOnMap";
import { useNow } from "@/src/hooks/useNow";
import { VoicePTT } from "@/src/components/party/VoicePTT";
import { usePublicProfileVehicles } from "@/src/hooks/useProfile";
import { setConvoyProgress } from "@/src/lib/live-share";
import { useLiveShare } from "@/src/hooks/useLiveShare";
import { useChallengeRace } from "@/src/hooks/useChallengeRace";
import { useInviteToParty } from "@/src/hooks/usePartyInvites";
import { lastSeenLabel, SHARE_OUTSIDE_PARTY, sharesWithFriends } from "@/src/lib/party-invites";
import { useSharing } from "@/src/store/sharing";
import { useFollow } from "@/src/store/follow";
import { useChallengeDraft } from "@/src/store/challenge-draft";
import { confirmResponsibleDriving } from "@/src/hooks/useChallengeScreen";
import type { ChallengeCategory } from "@/src/types/models";
import { reachedNextStop } from "@/src/lib/stops";
import { markAlertsSeen } from "@/src/lib/background-alerts";
import { useGarageVehicles } from "@/src/hooks/useGarage";
import { useGraphHopperRoute } from "@/src/hooks/useGraphHopperRoute";
import {
  useLiveLocation,
  refreshStaleLocation,
} from "@/src/hooks/useLiveLocation";
import { useMapTheme } from "@/src/hooks/useMapTheme";
import {
  useParkingDetector,
  distanceToSpotMeters,
} from "@/src/hooks/useParkingDetector";
import { useRoadInfo } from "@/src/hooks/useRoadInfo";
import { useActiveParty, useSetPartyDestination } from "@/src/hooks/useParty";
import { ConvoyDestinationCard } from "@/src/components/navigation/ConvoyDestinationCard";
import {
  convoyDestinationAction,
  followDestination,
  followStatus,
  destinationKey as convoyDestinationKey,
  isMemberLive,
  isMemberOnMap,
  reachedConvoyGoal,
  LIVE_SHARE_MAX_ACCURACY_M,
  sameDestination,
  shouldShareMyDestination,
} from "@/src/lib/convoy";
import { useChallenges, useCreateChallenge } from "@/src/hooks/useChallenges";
import { useTripRecorder } from "@/src/hooks/useTripRecorder";
import { useFreeOrientation } from "@/src/hooks/useFreeOrientation";
import { useVoiceGuidance } from "@/src/hooks/useVoiceGuidance";
import { showError } from "@/src/lib/alerts";
import { buildDrivingLine } from "@/src/lib/driving-line";
import {
  driveRoute,
  PHASE_LABELS,
  stopSimulation,
  useSimulator,
} from "@/src/lib/simulator";
import { haversineMeters } from "@/src/lib/geo";
import { fasterRouteSaving } from "@/src/lib/route-geometry";
import { fetchStreetRoutes, formatRouteDistance, formatRouteTime } from "@/src/lib/graphhopper";
import type { WorldMapAlternative, WorldMapMember } from "@/src/lib/map-html";
import {
  cumulativeDistances,
  followingInstruction,
  nextInstruction,
  routeProgress,
} from "@/src/lib/route-instructions";
import { uniqueRecents, useChosenDestination } from "@/src/store/destination";
import { useParking } from "@/src/store/parking";
import {
  DAY_CHROME,
  MapChromeContext,
  NIGHT_CHROME,
} from "@/src/components/navigation/glass";
import { colors, radius, spacing } from "@/src/theme";
import { displaySpeed, formatDistance, getLocale, speechLanguage, speedUnit, t } from "@/src/i18n";

// La intro (galaxia → globo → tu calle) solo al abrir la app, no cada vez que
// se vuelve a esta pestaña.
let introPlayed = false;
// MAPA-12: cada cuánto se busca una ruta más rápida navegando.
const FASTER_ROUTE_EVERY_MS = 3 * 60_000;

// MAPA-16: desvío y recálculo automático.
const OFF_ROUTE_M = 40;
const OFF_ROUTE_HOLD_MS = 5_000;
const REROUTE_EVERY_MS = 8_000;

const INTRO_PLAN = {
  earthAtMs: EARTH_START_MS,
  earthMs: EARTH_MS,
  flightAtMs: FLIGHT_START_MS,
  flightMs: FLIGHT_MS,
};

function formatParkingDistance(meters: number | null) {
  if (meters == null) return t('aquí cerca');
  return formatDistance(meters);
}

// Pantalla inicial personal, estilo Waze: tu coche, tu destino y tus amigos
// en el mapa para invitarlos al convoy o retarlos. Sin elementos de party.
export default function NavigationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useCurrentUser();
  const live = useLiveLocation();
  const { party, isDemo } = useActiveParty({ poll: true });
  const mapNow = useNow();
  const { vehicles } = useGarageVehicles();
  const {
    members: realFriends,
    friendCount,
    now: friendsNow,
  } = useFriendsOnMap();
  const inviteToParty = useInviteToParty();
  const shareWithFriends = useSharing((state) => state.shareWithFriends);
  const setShareWithFriends = useSharing((state) => state.setShareWithFriends);
  // En simulación de party, los amigos simulados se suman a los reales.
  const simMembers = useSimulator((state) => state.members);
  // Los de tu party llegan en tiempo real (cada ~3 s); los demás amigos, por
  // la posición que comparten. Si alguien está en ambos, gana la party.
  const partyOnMap = useMemo(
    () =>
      party && !isDemo
        ? party.members
            .filter(
              (member) =>
                !member.isMe &&
                member.lastLat != null &&
                member.lastLng != null &&
                isMemberOnMap(member.lastSeenAt, mapNow),
            )
            .map((member) => ({
              id: member.userId,
              name: member.profile.displayName,
              color: member.color,
              latitude: member.lastLat as number,
              longitude: member.lastLng as number,
              isTalking: false,
              stale: !isMemberLive(member.lastSeenAt, mapNow),
            }))
        : [],
    [party, isDemo, mapNow],
  );
  const liveMembers = useMemo(() => {
    const inParty = new Set(partyOnMap.map((member) => member.id));
    return [
      ...partyOnMap,
      ...realFriends.filter((friend) => !inParty.has(friend.id)),
      ...simMembers,
    ];
  }, [partyOnMap, realFriends, simMembers]);
  const mapFriends = liveMembers;

  const [introActive, setIntroActive] = useState(() => !introPlayed);
  const endIntro = useCallback(() => setIntroActive(false), []);
  useEffect(() => {
    introPlayed = true;
    // Con «reducir movimiento» activado no hay animación de entrada.
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) setIntroActive(false);
    });
  }, []);
  const tripDistanceM = useTrips((state) => state.totals.distanceM);

  // «Seguir a»: el destino es la posición en vivo de un piloto del convoy y
  // se mueve con él (cada 150 m, para no recalcular la ruta sin parar).
  const followTarget = useFollow((state) => state.target);
  const stopFollowing = useFollow((state) => state.stop);
  const followedMember = followTarget
    ? liveMembers.find((member) => member.id === followTarget.id) ?? null
    : null;
  const followedSeenAt =
    party?.members.find((member) => member.userId === followTarget?.id)?.lastSeenAt ?? null;
  const followAppliedRef = useRef(false);
  const followLat = followedMember?.latitude;
  const followLng = followedMember?.longitude;
  useEffect(() => {
    if (!followTarget) {
      followAppliedRef.current = false;
      return;
    }
    const store = useChosenDestination.getState();
    const next = followDestination(store.destination, {
      id: followTarget.id,
      position:
        followLat != null && followLng != null
          ? { latitude: followLat, longitude: followLng }
          : null,
    });
    if (!next) return;
    followAppliedRef.current = true;
    store.setDestination({
      ...next,
      label: followTarget.name,
      personal: true,
      followId: followTarget.id,
    });
    if (!store.isNavigating) store.startNavigation();
  }, [followTarget, followLat, followLng]);
  // Si eliges otro destino o terminas la ruta, dejas de seguir.
  const currentFollowId = useChosenDestination((state) => state.destination?.followId ?? null);
  useEffect(() => {
    if (!followTarget || !followAppliedRef.current) return;
    // Se lee del store (no del render): el efecto de arriba acaba de cambiarlo.
    const latest = useChosenDestination.getState().destination?.followId ?? null;
    if (latest !== followTarget.id) {
      followAppliedRef.current = false;
      stopFollowing();
    }
  }, [followTarget, currentFollowId, stopFollowing]);
  const createChallenge = useCreateChallenge();

  const [voiceMuted, setVoiceMuted] = useState(false);
  const [following, setFollowing] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [mapKey, setMapKey] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<WorldMapMember | null>(
    null,
  );
  // Usuario del piloto tocado en el mapa (amigo o compañero de party).
  const selectedFriendUsername = selectedFriend
    ? ((selectedFriend as { username?: string }).username ??
      party?.members.find((member) => member.userId === selectedFriend.id)?.profile.username ??
      null)
    : null;
  const { vehicles: selectedFriendVehicles } = usePublicProfileVehicles(
    selectedFriend && !isDemo ? selectedFriend.id : undefined,
  );
  const selectedFriendDetails = selectedFriend
    ? [
        selectedFriendUsername ? `@${selectedFriendUsername}` : null,
        selectedFriendVehicles[0]
          ? `${selectedFriendVehicles[0].make} ${selectedFriendVehicles[0].model}`
          : null,
        formatDistance(haversineMeters(live.location, selectedFriend)),
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  const [recordingNow, setRecordingNow] = useState(() => Date.now());
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [northUp, setNorthUp] = useState(false);
  const lastRerouteAtRef = useRef(0);

  const chosenDestination = useChosenDestination((state) => state.destination);
  const clearChosenDestination = useChosenDestination(
    (state) => state.clearDestination,
  );
  const storedRecents = useChosenDestination((state) => state.recents);
  const recentDestinations = useMemo(() => uniqueRecents(storedRecents), [storedRecents]);
  const isNavigating = useChosenDestination((state) => state.isNavigating);
  const startNavigation = useChosenDestination(
    (state) => state.startNavigation,
  );

  const destination = chosenDestination;
  const partyDestination = useMemo(
    () =>
      party?.destinationLat != null && party.destinationLng != null
        ? {
            latitude: party.destinationLat,
            longitude: party.destinationLng,
            label: party.destinationLabel ?? t('Destino del convoy'),
            setBy: party.destinationSetBy,
            setAt: party.destinationSetAt,
          }
        : null,
    [party],
  );

  const stops = useChosenDestination((state) => state.stops);
  const removeStop = useChosenDestination((state) => state.removeStop);
  const route = useGraphHopperRoute({
    origin: live.location,
    destination: destination ?? live.location,
    stops,
    enabled: Boolean(destination),
  });
  const retryRoute = route.retry;
  const roadInfo = useRoadInfo(live.location);

  const primaryVehicle =
    vehicles.find((vehicle) => vehicle.isPrimary) ?? vehicles[0];
  const parkingSpot = useParking((state) => state.spot);
  const clearParking = useParking((state) => state.clearSpot);
  const mapParking = useMemo(
    () =>
      parkingSpot
        ? { latitude: parkingSpot.latitude, longitude: parkingSpot.longitude }
        : null,
    [parkingSpot],
  );
  useParkingDetector(live.location, isNavigating ? destination : null);
  const sim = useSimulator();
  const simulating = sim.active;
  // Tu posición en la party (solo GPS real: nunca la de demo ni la simulada).
  // Tu posición en vivo para la party y tus amigos (solo GPS real: nunca la
  // de demo ni la simulada).
  // Reto por llegada en curso: avance y puesto automáticos.
  const { racing: racingChallenge } = useChallenges();
  useChallengeRace(
    live.location,
    !isDemo && live.isLive && live.location.source === "gps",
  );
  useLiveShare(live.location, {
    partyId: party && !isDemo ? party.id : null,
    hasFriends: friendCount > 0,
    // Con 200-300 m de error (dentro de casa) los demás te verían saltar.
    enabled:
      !isDemo &&
      live.isLive &&
      live.location.source === "gps" &&
      (live.location.accuracy == null || live.location.accuracy <= LIVE_SHARE_MAX_ACCURACY_M),
  });
  // Tus amigos te ven en su mapa (si lo permites; se pregunta una vez).
  useEffect(() => {
    if (!SHARE_OUTSIDE_PARTY || isDemo || friendCount === 0 || shareWithFriends !== null) return;
    Alert.alert(
      t('¿Que tus amigos te vean en el mapa?'),
      t('Tus amigos verán tu última posición en su mapa, y tú la suya si también lo activan. Puedes cambiarlo en Perfil.'),
      [
        { text: t('Ahora no'), style: "cancel", onPress: () => setShareWithFriends(false) },
        { text: t('Compartir'), onPress: () => setShareWithFriends(true) },
      ],
    );
  }, [isDemo, friendCount, shareWithFriends, setShareWithFriends]);
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
  const [firstWelcome] = useState(takeFirstWelcome);
  const [introHour] = useState(() => new Date().getHours());
  const introGreeting = useMemo(
    () =>
      buildGreeting({
        name: me.name,
        hour: introHour,
        firstTime: firstWelcome,
        partyName: party?.name,
        vehicleName: primaryVehicle?.nickname || vehicleName,
        friendsOnMap: mapFriends.length,
        totalDistanceM: tripDistanceM,
      }),
    [me.name, introHour, firstWelcome, party?.name, primaryVehicle?.nickname, vehicleName, mapFriends.length, tripDistanceM],
  );
  // Los viajes simulados no se graban, salvo en la prueba de grabación
  // (quedan marcados como prueba y se borran al parar).
  const simRecords = useSimulator((state) => state.recordTrips);
  const { active: activeTrip } = useTripRecorder(live.location, vehicleName, {
    walking: walking || (simulating && !simRecords),
    test: simulating,
  });
  const speedLabel =
    live.location.speedKmh == null
      ? "--"
      : String(displaySpeed(live.location.speedKmh));
  // P1-5 (docs/AUDITORIA-PRODUCCION.md): una línea directa no es una ruta por
  // carretera. Sin ruta real no se dibuja ni se guía («Calculando ruta…»
  // mientras se reintenta); la tarjeta lo explica.
  const streetRoute = route.route?.source === "fallback" ? null : route.route;
  const routeLine = streetRoute
    ? `${formatRouteDistance(streetRoute.distanceM)} · ${formatRouteTime(streetRoute.timeMs)}`
    : null;
  const fastestTimeMs = route.routes[0]?.timeMs ?? 0;
  const routeOptions = useMemo<RouteOption[]>(
    () =>
      route.routes.map((option) => ({
        timeLabel: formatRouteTime(option.timeMs),
        distanceLabel: formatRouteDistance(option.distanceM),
        extraMinutes: Math.max(
          0,
          Math.round((option.timeMs - fastestTimeMs) / 60_000),
        ),
      })),
    [route.routes, fastestTimeMs],
  );

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
        ? routeProgress(route.route.coordinates, routeCumulative, {
            latitude,
            longitude,
          })
        : null,
    [route.route, routeCumulative, latitude, longitude],
  );
  const progressM = progressState?.progressM ?? null;
  const routeDistanceFromPathM = progressState?.distanceM ?? null;
  // MAPA-16: fuera de la ruta = a más de 40 m durante 5 s (un salto suelto
  // del GPS no cuenta).
  const awayFromRoute = Boolean(
    route.route &&
    routeDistanceFromPathM != null &&
    routeDistanceFromPathM > OFF_ROUTE_M,
  );
  const [offRouteHeld, setOffRouteHeld] = useState(false);
  useEffect(() => {
    if (!awayFromRoute) return;
    const timer = setTimeout(() => setOffRouteHeld(true), OFF_ROUTE_HOLD_MS);
    return () => {
      clearTimeout(timer);
      setOffRouteHeld(false);
    };
  }, [awayFromRoute]);
  const offRoute = awayFromRoute && offRouteHeld;
  const upcoming = useMemo(
    () => nextInstruction(route.route?.instructions, progressM),
    [route.route, progressM],
  );
  const thenInstruction = useMemo(
    () => followingInstruction(route.route?.instructions, upcoming),
    [route.route, upcoming],
  );
  const remainingRouteM =
    route.route && progressM != null
      ? Math.max(0, route.route.distanceM - progressM)
      : null;
  const remainingTimeMs =
    route.route && remainingRouteM != null && route.route.distanceM > 0
      ? route.route.timeMs * (remainingRouteM / route.route.distanceM)
      : null;

  // CONV-04: tu ETA y lo que te queda hasta la meta común viajan con tu
  // posición (también con la pantalla bloqueada). Solo si vas hacia la meta.
  const headingToConvoyGoal =
    Boolean(party) && !isDemo && isNavigating && Boolean(destination) && sameDestination(destination, partyDestination);
  const convoyArrived =
    headingToConvoyGoal && reachedConvoyGoal(live.location, partyDestination, remainingRouteM);
  useEffect(() => {
    if (!headingToConvoyGoal || remainingRouteM == null || remainingTimeMs == null) {
      setConvoyProgress(null);
      return;
    }
    setConvoyProgress({
      etaS: remainingTimeMs / 1000,
      remainingM: remainingRouteM,
      arrived: convoyArrived,
    });
  }, [headingToConvoyGoal, remainingRouteM, remainingTimeMs, convoyArrived]);

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

  const handleFollowChange = useCallback(
    (value: boolean) => setFollowing(value),
    [],
  );
  const handleMapError = useCallback(
    (message: string) => setMapError(message),
    [],
  );

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
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") ensureFollowing();
    });
    return () => subscription.remove();
  }, [ensureFollowing]);

  // Con la app abierta Android también puede pausar el GPS sin avisar: si la
  // posición se queda vieja, se pide otra sin tener que reabrir la app.
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") refreshStaleLocation(30_000);
    }, 20_000);
    return () => clearInterval(timer);
  }, []);

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
      ? new Date(clockNow + remainingTimeMs).toLocaleTimeString(getLocale(), {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
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
        message: t('Ruta de Caravana → {0}\n{1}\nÁbrela en la app: {2}', label, mapLink, deepLink),
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
  const [parkingFocus, setParkingFocus] = useState<{
    latitude: number;
    longitude: number;
    token: number;
  } | null>(null);
  const showParkedCar = () => {
    if (!parkingSpot) return;
    setParkingFocus({
      latitude: parkingSpot.latitude,
      longitude: parkingSpot.longitude,
      token: Date.now(),
    });
  };

  const goToParkedCar = () => {
    if (!parkingSpot) return;
    useChosenDestination.getState().setDestination({
      latitude: parkingSpot.latitude,
      longitude: parkingSpot.longitude,
      label: t('Mi coche'),
      personal: true,
    });
    beginNavigation();
  };

  // Acciones sobre un amigo visto en el mapa. Invitar es un toque: si aún
  // no tienes party, se crea y le llega la invitación al momento.
  const inviteToConvoy = async (friend: WorldMapMember) => {
    if (isDemo) {
      Alert.alert(
        t('Convoy'),
        t('Los convoys reales requieren una cuenta conectada.'),
      );
      return;
    }
    if (party?.members.some((member) => member.userId === friend.id)) {
      Alert.alert(t('Convoy'), t('{0} ya está en tu party.', friend.name.split(" ")[0]));
      return;
    }
    try {
      await inviteToParty.mutateAsync({
        partyId: party?.id ?? null,
        userIds: [friend.id],
        myName: me.name,
      });
      Alert.alert(
        t('Invitación enviada'),
        t('{0} la verá al momento. Cuando acepte, aparecerá en tu party.', friend.name.split(" ")[0]),
      );
    } catch (error) {
      showError(t('Convoy'), error, t('No pudimos invitar.'));
    }
  };

  const challengeFriend = (friend: WorldMapMember) => {
    if (isDemo) {
      Alert.alert(t('Retos'), t('Los retos reales requieren una cuenta conectada.'));
      return;
    }
    const first = friend.name.split(" ")[0];
    const draft = {
      title: `Reto: ${first}`,
      category: (primaryVehicle?.kind ?? "mixed") as ChallengeCategory,
      hostVehicleId: primaryVehicle?.id,
      hostVehicleKind: primaryVehicle?.kind ?? ("car" as const),
      invitees: [{ userId: friend.id, vehicleKind: "car" as const }],
    };
    setSelectedFriend(null);
    // RETO-06 / RETO-01: aviso responsable y meta (la tuya u otra en el mapa).
    void confirmResponsibleDriving().then((accepted) => {
      if (!accepted) return;
      const goal = destination ?? partyDestination;
      const pickOther = () => {
        useChallengeDraft.getState().start(draft);
        router.push({ pathname: "/destino", params: { mode: "challenge" } });
      };
      if (!goal) {
        pickOther();
        return;
      }
      Alert.alert(t('Reto a {0}', first), t('Gana quien llegue primero. ¿A dónde?'), [
        { text: t('Cancelar'), style: "cancel" },
        { text: t('Otra meta'), onPress: pickOther },
        {
          text: goal.label.length > 18 ? t('Mi destino') : goal.label,
          onPress: () =>
            void createChallenge
              .mutateAsync({
                ...draft,
                mode: "instant",
                waitForRivals: true,
                fromLabel: t('Mi ubicación'),
                toLabel: goal.label,
                endLat: goal.latitude,
                endLng: goal.longitude,
                distanceKm: (route.route?.distanceM ?? 0) / 1000,
                rules: t('Por llegada: gana quien llegue primero respetando las leyes.'),
              })
              .then(() =>
                Alert.alert(t('Reto enviado'), t('Cuando acepten, da la salida desde la pestaña Retos.')),
              )
              .catch((error: unknown) => showError(t('Reto'), error, t('No pudimos crear el reto.'))),
        },
      ]);
    });
  };

  const handleFriendPress = useCallback(
    (id: string) => {
      const friend = mapFriends.find((member) => member.id === id) ?? null;
      setSelectedFriend(friend);
    },
    [mapFriends],
  );

  const navigating = isNavigating && Boolean(destination);
  // UI-04: navegando, la pantalla gira con el teléfono (soporte horizontal).
  useFreeOrientation(navigating);

  // Antes de salir se ven las alternativas en gris; durante la navegación,
  // solo la ruta elegida.
  const mapAlternatives = useMemo<WorldMapAlternative[]>(
    () =>
      navigating
        ? []
        : route.routes
            .map((option, index) => {
              const extra = Math.round((option.timeMs - fastestTimeMs) / 60_000);
              return {
                index,
                coordinates: option.coordinates,
                label: extra > 0 ? t('+{0} min', extra) : t('Igual de rápida'),
              };
            })
            .filter((option) => option.index !== route.selected),
    [navigating, route.routes, route.selected, fastestTimeMs],
  );
  const selectRoute = route.select;

  useVoiceGuidance({
    upcoming: offRoute ? null : upcoming,
    enabled: navigating && !voiceMuted,
    speedKmh: live.location.speedKmh ?? null,
  });

  // Parada alcanzada: se quita de la lista y la ruta sigue a la próxima.
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  // Distancia de la próxima parada a la ruta (la ruta pasa por la calle más
  // cercana, no por la parada exacta).
  const nextStopOffRoadM = useMemo(() => {
    const next = stops[0];
    if (!next || !route.route || routeCumulative.length < 2) return 0;
    return routeProgress(route.route.coordinates, routeCumulative, next)?.distanceM ?? 0;
  }, [stops, route.route, routeCumulative]);
  const atNextStop = navigating && reachedNextStop(live.location, stops, nextStopOffRoadM);
  useEffect(() => {
    if (!atNextStop) return;
    const label = useChosenDestination.getState().stops[0]?.label;
    const timer = setTimeout(() => {
      removeStop(0);
      if (!label) return;
      setStopNotice(label);
      if (!voiceMuted) Speech.speak(t("Parada: {0}", label), { language: speechLanguage() });
    }, 0);
    return () => clearTimeout(timer);
  }, [atNextStop, removeStop, voiceMuted]);
  useEffect(() => {
    if (!stopNotice) return;
    const timer = setTimeout(() => setStopNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [stopNotice]);
  const addStopHere = () =>
    router.push({ pathname: "/destino", params: { mode: "stop" } } as Href);

  // Llegada: a menos de 40 m del destino (o al final de la ruta) se termina
  // la navegación sola y se avisa, como Waze.
  const [arrivedLabel, setArrivedLabel] = useState<string | null>(null);
  const destinationDistanceM = destination
    ? haversineMeters(live.location, destination)
    : null;
  const arrived =
    navigating &&
    destination != null &&
    ((destinationDistanceM != null && destinationDistanceM < 40) ||
      (remainingRouteM != null &&
        remainingRouteM < 20 &&
        (routeDistanceFromPathM ?? 999) < 40));
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
        setTimeout(
          () => Speech.speak(t('Has llegado a {0}', label), { language: speechLanguage() }),
          600,
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [arrived, destination, voiceMuted, clearChosenDestination]);
  useEffect(() => {
    if (!arrivedLabel) return;
    const timer = setTimeout(() => setArrivedLabel(null), 8_000);
    return () => clearTimeout(timer);
  }, [arrivedLabel]);

  // Simulación de ruta: en cuanto llega una ruta nueva, el coche la recorre.
  // La que ya había al empezar a esperar (de otro destino o la de antes de un
  // desvío) no vale.
  const staleRouteRef = useRef<typeof route.route | undefined>(undefined);
  useEffect(() => {
    if (sim.phase !== "waiting-route") {
      staleRouteRef.current = undefined;
      return;
    }
    if (staleRouteRef.current === undefined) {
      staleRouteRef.current = route.route;
      // Pide una ruta nueva desde donde estás: si el destino no cambió, la
      // anterior seguiría siendo la misma y la simulación esperaría para siempre.
      retryRoute();
      return;
    }
    if (!navigating || !route.route || route.route === staleRouteRef.current)
      return;
    driveRoute(route.route.coordinates);
  }, [sim.phase, navigating, route.route, retryRoute]);

  // En una party, el destino que eliges se comparte con el convoy (salvo ir
  // a por tu coche, que es solo tuyo).
  const setPartyDestination = useSetPartyDestination();
  const shareDestinationWithConvoy = setPartyDestination.mutate;
  const beginNavigation = useCallback(() => {
    setFollowing(true);
    setRecenterToken((value) => value + 1);
    startNavigation();
  }, [startNavigation]);

  // Cada destino nuevo que eliges navegando se comparte con el convoy, venga
  // de donde venga (antes solo el primero, al pulsar Ir en el mapa). Al abrir
  // la app se toma el destino actual como ya compartido: así un destino viejo
  // no pisa el que haya puesto otro piloto mientras tanto.
  const sharedKeyRef = useRef<string | null | undefined>(undefined);
  // CONV-02: solo el anfitrión o un copiloto cambian el destino del convoy.
  const canSetConvoyDestination =
    Boolean(party?.isHost) || party?.members.find((member) => member.isMe)?.role === 'sweeper';
  const partyIdForShare = party && !isDemo && canSetConvoyDestination ? party.id : null;
  useEffect(() => {
    if (!partyIdForShare) {
      sharedKeyRef.current = undefined;
      return;
    }
    if (sharedKeyRef.current === undefined) {
      sharedKeyRef.current = isNavigating ? convoyDestinationKey(destination) : null;
      return;
    }
    const decision = shouldShareMyDestination({
      previousKey: sharedKeyRef.current,
      mine: destination,
      party: partyDestination,
      navigating: isNavigating,
      personal: Boolean(destination?.personal),
    });
    sharedKeyRef.current = decision.key;
    if (decision.share && destination) {
      shareDestinationWithConvoy({
        partyId: partyIdForShare,
        label: destination.label,
        lat: destination.latitude,
        lng: destination.longitude,
      });
    }
  }, [partyIdForShare, isNavigating, destination, partyDestination, shareDestinationWithConvoy]);

  // Otro piloto fijó o cambió el destino. Si ibas siguiendo el convoy,
  // cambias solo (con un aviso); si no, «Ir con el convoy» con un toque.
  const [dismissedConvoyAt, setDismissedConvoyAt] = useState<string | null>(null);
  const [convoyNotice, setConvoyNotice] = useState<{ name: string; label: string } | null>(null);
  const followedKeyRef = useRef<string | null>(null);
  const handledAtRef = useRef<string | null>(null);
  const convoyDestinationSetter = party?.members.find(
    (member) => member.userId === partyDestination?.setBy,
  );
  const setterName = convoyDestinationSetter?.profile.displayName ?? t('Un piloto');

  // Recuerda el destino del convoy que vas siguiendo.
  useEffect(() => {
    if (isNavigating && partyDestination && sameDestination(destination, partyDestination)) {
      followedKeyRef.current = convoyDestinationKey(destination);
      handledAtRef.current = partyDestination.setAt;
    }
  }, [isNavigating, destination, partyDestination]);

  // En pantalla: sin saber si lo ibas siguiendo, como mucho «ofrecer»; si lo
  // seguías, el efecto de abajo te cambia al momento y la oferta desaparece.
  const convoyAction = isDemo
    ? "none"
    : convoyDestinationAction({
        me: me.id,
        party: partyDestination,
        mine: destination,
        navigating: isNavigating,
        handledAt: dismissedConvoyAt,
        followedKey: null,
      });

  useEffect(() => {
    if (isDemo || !partyDestination) return;
    const action = convoyDestinationAction({
      me: me.id,
      party: partyDestination,
      mine: destination,
      navigating: isNavigating,
      handledAt: handledAtRef.current,
      followedKey: followedKeyRef.current,
    });
    if (action !== "follow") return;
    handledAtRef.current = partyDestination.setAt;
    useChosenDestination.getState().setDestination({
      latitude: partyDestination.latitude,
      longitude: partyDestination.longitude,
      label: partyDestination.label,
    });
    const notice = { name: setterName.split(" ")[0], label: partyDestination.label };
    const show = setTimeout(() => setConvoyNotice(notice), 0);
    const hide = setTimeout(() => setConvoyNotice(null), 7_000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [isDemo, me.id, partyDestination, destination, isNavigating, setterName]);

  const offerConvoyDestination = convoyAction === "offer" && partyDestination != null;
  // Lo que ya ves en pantalla no te llega luego como notificación.
  const partyIdForAlerts = party?.id;
  const destinationSetAt = partyDestination?.setAt;
  useEffect(() => {
    if (partyIdForAlerts && destinationSetAt) {
      void markAlertsSeen([`destination:${partyIdForAlerts}:${destinationSetAt}`]);
    }
  }, [partyIdForAlerts, destinationSetAt]);
  const followConvoyDestination = () => {
    if (!partyDestination) return;
    useChosenDestination.getState().setDestination({
      latitude: partyDestination.latitude,
      longitude: partyDestination.longitude,
      label: partyDestination.label,
    });
    setDismissedConvoyAt(partyDestination.setAt);
    setFollowing(true);
    setRecenterToken((value) => value + 1);
    startNavigation();
  };

  // MAPA-12 (como Waze): navegando, cada 3 min se busca una ruta más rápida
  // por el tráfico desde donde estás. Si ahorra de verdad (2 min y un 8 %),
  // se cambia sola y se avisa por voz.
  const fasterCheckRef = useRef({ remainingS: 0, origin: live.location, destination, stops });
  useEffect(() => {
    fasterCheckRef.current = {
      remainingS: (remainingTimeMs ?? 0) / 1000,
      origin: live.location,
      destination,
      stops,
    };
  }, [remainingTimeMs, live.location, destination, stops]);
  const adoptRoutes = route.adopt;
  useEffect(() => {
    if (!navigating) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setInterval(() => {
      const { remainingS, origin, destination: goal, stops: waypoints } = fasterCheckRef.current;
      if (!goal || remainingS < 300) return;
      void fetchStreetRoutes({ origin, destination: goal, stops: waypoints, signal: controller.signal })
        .then((candidates) => {
          if (cancelled || candidates[0]?.source === 'fallback') return;
          const saving = fasterRouteSaving(remainingS, candidates[0].timeMs / 1000);
          if (saving == null) return;
          adoptRoutes(candidates);
          if (!voiceMuted) {
            Speech.speak(t('Encontré una ruta más rápida: ahorras {0} minutos.', Math.round(saving / 60)), {
              language: speechLanguage(),
            });
          }
        })
        .catch(() => undefined);
    }, FASTER_ROUTE_EVERY_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [navigating, adoptRoutes, voiceMuted]);

  useEffect(() => {
    if (!navigating || !offRoute || route.isLoading) return;
    const now = Date.now();
    if (now - lastRerouteAtRef.current < REROUTE_EVERY_MS) return;
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
        ? buildDrivingLine(
            route.route.coordinates,
            progressState.nearestIndex,
            speedKmhNow,
            roadInfo.limitKmh ?? null,
          )
        : null,
    [
      navigating,
      walking,
      route.route,
      progressState,
      offRoute,
      speedKmhNow,
      roadInfo.limitKmh,
    ],
  );

  // Los controles se ven claros sobre el mapa de día y oscuros de noche.
  const chrome =
    useMapTheme(live.location) === "day" ? DAY_CHROME : NIGHT_CHROME;
  const parkingTint = chrome.accent;

  return (
    <View style={styles.root}>
      <WorldMap
        key={mapKey}
        members={mapFriends}
        destination={destination}
        location={live.location}
        parking={mapParking}
        travelMode={walking ? "walking" : "car"}
        northUp={northUp}
        route={streetRoute}
        alternatives={mapAlternatives}
        stops={stops}
        // Antes de «Iniciar», vista de la ruta entera; al iniciar te sigue.
        fitRoute={!navigating && route.route ? route.route.coordinates : null}
        fitBottom={bottomHeight + 40}
        onAlternativePress={selectRoute}
        vehicleColor={primaryVehicle?.color}
        vehicleKind={primaryVehicle?.kind}
        recenterToken={recenterToken}
        focus={parkingFocus}
        intro={introActive ? INTRO_PLAN : null}
        drivingLine={drivingLine?.data ?? null}
        ornamentBottom={navigating ? 4 : bottomHeight + spacing.md + 6}
        onFollowChange={handleFollowChange}
        onMemberPress={handleFriendPress}
        onError={handleMapError}
        style={StyleSheet.absoluteFill}
      />

      <MapChromeContext.Provider value={chrome}>
        <View
          pointerEvents={introActive ? "none" : "box-none"}
          style={[
            styles.overlay,
            { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md },
            introActive && styles.hidden,
          ]}
        >
          {navigating && destination ? (
            <>
            <NavigationHud
              upcoming={upcoming ?? null}
              following={thenInstruction}
              offRoute={offRoute}
              hasRoute={Boolean(routeLine)}
              arrivalLabel={arrivalLabel}
              remainingTimeLabel={formatRouteTime(
                remainingTimeMs ?? route.route?.timeMs ?? 0,
              )}
              remainingDistanceLabel={formatRouteDistance(
                remainingRouteM ?? route.route?.distanceM ?? 0,
              )}
              destinationLabel={
                stops.length > 0
                  ? t('{0} · luego {1}', stops[0].label, destination.label)
                  : destination.label
              }
              speedLabel={speedLabel}
              limitKmh={roadInfo.limitKmh ?? null}
              curve={drivingLine?.nextCurve ?? null}
              northUp={northUp}
              mapFollowing={following}
              onRecenter={recenter}
              muted={voiceMuted}
              bottomInset={insets.bottom}
              onToggleNorth={toggleNorthUp}
              onToggleMute={() => setVoiceMuted((value) => !value)}
              onChangeRoute={() => router.push("/destino" as Href)}
              onAddStop={addStopHere}
              onClose={clearDestination}
              onOpenParty={party ? () => router.navigate("/(tabs)/party") : undefined}
              voiceButton={party && !isDemo ? <VoicePTT size={50} /> : undefined}
              onOpenChallenge={
                racingChallenge
                  ? () => router.push(`/challenge/${racingChallenge.code}` as Href)
                  : undefined
              }
            />
            {/* Avisos navegando: arriba, bajo la tarjeta de giro (abajo
                tapaban el velocímetro y tu posición). */}
            <View
              pointerEvents="box-none"
              style={[styles.convoyOffer, { top: insets.top + 200 }]}
            >
              {followTarget ? (
                <View style={[styles.convoyNotice, chrome.surface]}>
                  <Ionicons name="navigate-circle" size={20} color={chrome.text} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" color={chrome.text} numberOfLines={1}>
                      {t('Siguiendo a')}{' '}{followTarget.name.split(" ")[0]}
                    </AppText>
                    <AppText variant="caption" color={chrome.muted}>
                      {followStatus(
                        live.location,
                        followedMember
                          ? { latitude: followedMember.latitude, longitude: followedMember.longitude }
                          : null,
                        followedSeenAt,
                        clockNow,
                      )}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => {
                      stopFollowing();
                      clearDestination();
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('Dejar de seguir')}
                  >
                    <AppText variant="bodyStrong" color={chrome.muted} style={{ fontSize: 13 }}>
                      {t('Dejar')}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
              {stopNotice ? (
                <View style={[styles.convoyNotice, chrome.surface]} pointerEvents="none">
                  <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                  <AppText variant="bodyStrong" color={chrome.text} numberOfLines={1} style={{ flex: 1 }}>
                    {t('Parada hecha:')}{' '}{stopNotice}
                  </AppText>
                </View>
              ) : null}
              {convoyNotice ? (
                <View style={[styles.convoyNotice, chrome.surface]} pointerEvents="none">
                  <Ionicons name="flag" size={16} color={chrome.text} />
                  <AppText variant="bodyStrong" color={chrome.text} numberOfLines={2} style={{ flex: 1 }}>
                    {convoyNotice.name}{' '}{t('cambió el destino:')}{' '}{convoyNotice.label}
                  </AppText>
                </View>
              ) : null}
              {offerConvoyDestination && partyDestination && !followTarget ? (
                <ConvoyDestinationCard
                  key={partyDestination.setAt}
                  setterName={setterName}
                  label={partyDestination.label}
                  changed
                  compact
                  onFollow={followConvoyDestination}
                  onDismiss={() => setDismissedConvoyAt(partyDestination.setAt)}
                />
              ) : null}
            </View>
            </>
          ) : (
            <>
              {followTarget ? (
                <View style={[styles.convoyNotice, chrome.surface, styles.followWaiting]}>
                  <Ionicons name="navigate-circle" size={20} color={chrome.text} />
                  <AppText variant="bodyStrong" color={chrome.text} numberOfLines={2} style={{ flex: 1 }}>
                    {t('Siguiendo a')}{' '}{followTarget.name.split(" ")[0]}{' '}{t('· esperando su posición')}
                  </AppText>
                  <Pressable onPress={stopFollowing} hitSlop={10} accessibilityRole="button">
                    <AppText variant="bodyStrong" color={chrome.muted} style={{ fontSize: 13 }}>
                      {t('Dejar')}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
              {/* Inicio minimalista: un solo buscador con tu avatar. El vehículo se
                elige en Garaje y la actividad está en el icono del buscador. */}
              {destination == null ? (
                <View style={[styles.searchBar, chrome.surface]}>
                  <Pressable
                    style={styles.searchTap}
                    onPress={() => router.push("/destino" as Href)}
                    accessibilityRole="button"
                    accessibilityLabel={t('Buscar destino')}
                  >
                    <Ionicons name="search" size={20} color={chrome.accent} />
                    <AppText
                      variant="bodyStrong"
                      numberOfLines={1}
                      color={chrome.muted}
                      style={styles.searchText}
                    >
                      {t('¿A dónde vamos?')}
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/actividad" as Href)}
                    hitSlop={8}
                    style={styles.searchIcon}
                    accessibilityRole="button"
                    accessibilityLabel={t('Actividad')}
                  >
                    <Ionicons name="pulse" size={20} color={chrome.textSoft} />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/(tabs)/profile")}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={t('Tu perfil')}
                  >
                    <Avatar
                      name={me.name}
                      color={me.color}
                      size={36}
                      uri={me.avatarUrl}
                      online={live.isLive}
                    />
                  </Pressable>
                </View>
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
                      accessibilityLabel={t('Ir a {0}', recent.label)}
                    >
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={chrome.muted}
                      />
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

              {simulating ? (
                <View style={[styles.banner, chrome.surface, styles.simBanner]}>
                  <Ionicons name="flask" size={16} color="#7c3aed" />
                  <AppText
                    variant="caption"
                    color={chrome.textSoft}
                    numberOfLines={sim.stats ? 2 : 1}
                    style={styles.bannerText}
                  >
                    {sim.stats
                      ? sim.stats
                      : t('SIMULACIÓN · {0} · {1} {2}{3}', PHASE_LABELS[sim.phase], displaySpeed(sim.fix?.speedKmh ?? 0), speedUnit(), sim.party ? " · party" : "")}
                  </AppText>
                  <Pressable
                    onPress={() => router.push("/simulador" as Href)}
                    hitSlop={8}
                  >
                    <AppText
                      variant="label"
                      color="#7c3aed"
                      style={styles.retryText}
                    >
                      {t('OPCIONES')}
                    </AppText>
                  </Pressable>
                  <Pressable onPress={stopSimulation} hitSlop={8}>
                    <AppText
                      variant="label"
                      color={colors.accent}
                      style={styles.retryText}
                    >
                      {t('PARAR')}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}

              {arrivedLabel ? (
                <View
                  style={[styles.banner, chrome.surface, styles.arrivedBanner]}
                >
                  <Ionicons name="flag" size={18} color="#16a34a" />
                  <AppText
                    variant="bodyStrong"
                    color={chrome.text}
                    numberOfLines={2}
                    style={styles.bannerText}
                  >
                    {t('Has llegado a')}{' '}{arrivedLabel}
                  </AppText>
                  <Pressable
                    onPress={() => setArrivedLabel(null)}
                    hitSlop={8}
                    accessibilityLabel={t('Cerrar aviso')}
                  >
                    <Ionicons name="close" size={18} color={chrome.muted} />
                  </Pressable>
                </View>
              ) : null}

              {activeTrip ? (
                <View style={[styles.recordingPill, chrome.surface]}>
                  <View style={styles.recordingDot} />
                  <AppText variant="caption" color={chrome.textSoft}>
                    {t('Grabando ruta ·')}{" "}
                    {Math.max(
                      1,
                      Math.round(
                        (recordingNow - activeTrip.startedAt) / 60_000,
                      ),
                    )}{" "}
                    {t('min ·')}{" "}
                    {formatDistance(activeTrip.distanceM)}
                  </AppText>
                </View>
              ) : null}

              {showParking && parkingSpot ? (
                <View
                  style={[
                    styles.parkingPill,
                    chrome.surface,
                    { borderColor: parkingTint },
                  ]}
                >
                  <Pressable
                    style={styles.parkingShow}
                    onPress={showParkedCar}
                    onLongPress={() =>
                      Alert.alert(
                        t('Coche aparcado'),
                        t('¿Olvidar la ubicación guardada?'),
                        [
                          { text: t('Cancelar'), style: "cancel" },
                          {
                            text: t('Olvidar'),
                            style: "destructive",
                            onPress: clearParking,
                          },
                        ],
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('Ver mi coche aparcado en el mapa')}
                  >
                    <Ionicons name="car" size={15} color={parkingTint} />
                    <AppText
                      variant="caption"
                      color={chrome.textSoft}
                      style={styles.parkingText}
                      numberOfLines={1}
                    >
                      {t('Tu coche aparcado ·')}{" "}
                      {formatParkingDistance(parkingDistance)}
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={goToParkedCar}
                    hitSlop={8}
                    style={styles.parkingGo}
                    accessibilityRole="button"
                    accessibilityLabel={t('Ir a mi coche aparcado')}
                  >
                    <Ionicons name="navigate" size={14} color={parkingTint} />
                  </Pressable>
                </View>
              ) : null}

              {!live.isLive ? (
                <View style={[styles.banner, chrome.surface]}>
                  <View style={styles.bannerDot} />
                  <AppText
                    variant="caption"
                    color={chrome.textSoft}
                    numberOfLines={2}
                    style={styles.bannerText}
                  >
                    {live.message}
                  </AppText>
                  {live.status === "denied" ? (
                    <Pressable onPress={() => void Linking.openSettings()} hitSlop={8}>
                      <AppText
                        variant="label"
                        color={chrome.accent}
                        style={styles.retryText}
                      >
                        {t('AJUSTES')}
                      </AppText>
                    </Pressable>
                  ) : live.status !== "locating" ? (
                    <Pressable onPress={live.retry} hitSlop={8}>
                      <AppText
                        variant="label"
                        color={chrome.accent}
                        style={styles.retryText}
                      >
                        {t('REINTENTAR')}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {mapError ? (
                <View
                  style={[styles.banner, chrome.surface, styles.bannerError]}
                >
                  <Ionicons
                    name="warning-outline"
                    size={16}
                    color={colors.accent}
                  />
                  <AppText
                    variant="caption"
                    color={chrome.textSoft}
                    numberOfLines={2}
                    style={styles.bannerText}
                  >
                    {mapError}
                  </AppText>
                  <Pressable onPress={retryMap} hitSlop={8}>
                    <AppText
                      variant="label"
                      color={chrome.accent}
                      style={styles.retryText}
                    >
                      {t('REINTENTAR')}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.spacer} pointerEvents="none" />

              <View
                pointerEvents="box-none"
                style={styles.bottomCluster}
                onLayout={(event) =>
                  setBottomHeight(Math.round(event.nativeEvent.layout.height))
                }
              >
                <View style={styles.sideRow}>
                  <SpeedHud
                    speedLabel={speedLabel}
                    limitKmh={roadInfo.limitKmh ?? null}
                    isLive={live.isLive}
                    street={currentStreet ?? null}
                  />

                  <View style={styles.rightColumn} pointerEvents="box-none">
                  {/* CONV-14: hablar al convoy desde el mapa, en la esquina
                      sobre los controles. */}
                  {party && !isDemo && !introActive ? <VoicePTT size={52} /> : null}
                  <MapControls
                    northUp={northUp}
                    following={following}
                    onToggleNorth={toggleNorthUp}
                    onRecenter={recenter}
                    ghost={
                      SHARE_OUTSIDE_PARTY && !isDemo && friendCount > 0
                        ? !sharesWithFriends(shareWithFriends)
                        : undefined
                    }
                    onToggleGhost={() => setShareWithFriends(!sharesWithFriends(shareWithFriends))}
                  />
                  </View>
                </View>

                {destination ? (
                  <DestinationCard
                    label={destination.label}
                    timeLabel={
                      route.route ? formatRouteTime(route.route.timeMs) : null
                    }
                    distanceLabel={
                      route.route
                        ? formatRouteDistance(route.route.distanceM)
                        : null
                    }
                    arrivalLabel={arrivalLabel}
                    loading={route.isLoading}
                    error={route.error}
                    notice={
                      route.route?.source === "fallback"
                        ? t('No encontramos una ruta por carretera ahora mismo. Lo reintentamos solo; también puedes pulsar Reintentar.')
                        : null
                    }
                    options={routeOptions}
                    selected={route.selected}
                    canConfirm={!route.isLoading && Boolean(streetRoute)}
                    bottomInset={0}
                    onRetry={retryRoute}
                    onSelect={selectRoute}
                    onConfirm={beginNavigation}
                    onShare={() => void shareRouteLink()}
                    onClose={clearDestination}
                    stops={stops}
                    onAddStop={addStopHere}
                    onRemoveStop={removeStop}
                  />
                ) : null}

                {offerConvoyDestination && partyDestination ? (
                  <ConvoyDestinationCard
                    key={partyDestination.setAt}
                    setterName={setterName}
                    label={partyDestination.label}
                    changed={isNavigating}
                    onFollow={followConvoyDestination}
                    onDismiss={() => setDismissedConvoyAt(partyDestination.setAt)}
                  />
                ) : null}

                {selectedFriend ? (
                  <FriendSheet
                    friend={selectedFriend}
                    status={lastSeenLabel(
                      (selectedFriend as { updatedAt?: number }).updatedAt,
                      friendsNow,
                    )}
                    inviting={inviteToParty.isPending}
                    inviteLabel={
                      party?.members.some((member) => member.userId === selectedFriend.id)
                        ? t('En tu party')
                        : party
                          ? t('Invitar a mi party')
                          : t('Crear party e invitar')
                    }
                    onInvite={() => void inviteToConvoy(selectedFriend)}
                    onChallenge={() => challengeFriend(selectedFriend)}
                    details={selectedFriendDetails}
                    onFollow={() => {
                      // MAPA-23: seguir a cualquier amigo visible en el mapa.
                      useFollow
                        .getState()
                        .follow({ id: selectedFriend.id, name: selectedFriend.name });
                      setSelectedFriend(null);
                    }}
                    onProfile={
                      selectedFriendUsername
                        ? () => {
                            setSelectedFriend(null);
                            router.push(`/u/${selectedFriendUsername}`);
                          }
                        : undefined
                    }
                    onClose={() => setSelectedFriend(null)}
                  />
                ) : null}
              </View>

              <MapAttribution style={styles.attribution} />
            </>
          )}
        </View>
      </MapChromeContext.Provider>

      {introActive ? (
        <GalaxyIntro greeting={introGreeting} onDone={endIntro} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rightColumn: { alignItems: "flex-end", gap: spacing.sm },
  hidden: { opacity: 0 },
  convoyOffer: { position: "absolute", left: spacing.lg, right: spacing.lg, gap: spacing.sm },
  followWaiting: { marginBottom: spacing.sm },
  convoyNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.lg,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    borderRadius: 28,
    paddingLeft: spacing.lg,
    paddingRight: 10,
  },
  searchTap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
  },
  searchIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  roundButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  simBanner: { borderColor: "#7c3aed", borderWidth: 1.5 },
  arrivedBanner: { borderColor: "#16a34a", borderWidth: 1.5 },
  bannerError: { borderColor: "rgba(255,90,31,0.4)" },
  bannerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  bannerText: { flex: 1 },
  retryText: { fontSize: 9 },
  searchText: { flex: 1 },
  recordingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  recentChipText: { flexShrink: 1 },
  recentsScroll: {
    marginTop: spacing.xs,
    marginHorizontal: -spacing.lg,
    flexGrow: 0,
  },
  recentsRow: { gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    paddingRight: 4,
    paddingVertical: 4,
  },
  parkingShow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    paddingVertical: 2,
  },
  parkingText: { flexShrink: 1 },
  parkingGo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(77,225,255,0.16)",
  },
  spacer: { flex: 1 },
  bottomCluster: { gap: 0 },
  sideRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  attribution: {
    alignSelf: "center",
    marginTop: spacing.sm,
  },
});
