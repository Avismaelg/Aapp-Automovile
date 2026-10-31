import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MapAttribution } from "@/src/components/MapAttribution";
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
import { useLiveShare } from "@/src/hooks/useLiveShare";
import { useChallengeRace } from "@/src/hooks/useChallengeRace";
import { useInviteToParty } from "@/src/hooks/usePartyInvites";
import { lastSeenLabel } from "@/src/lib/party-invites";
import { useSharing } from "@/src/store/sharing";
import { useFollow } from "@/src/store/follow";
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
  sameDestination,
  shouldShareMyDestination,
} from "@/src/lib/convoy";
import { useCreateChallenge } from "@/src/hooks/useChallenges";
import { useTripRecorder } from "@/src/hooks/useTripRecorder";
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
import { formatRouteDistance, formatRouteTime } from "@/src/lib/graphhopper";
import type { WorldMapAlternative, WorldMapMember } from "@/src/lib/map-html";
import {
  cumulativeDistances,
  followingInstruction,
  nextInstruction,
  routeProgress,
} from "@/src/lib/route-instructions";
import { useChosenDestination } from "@/src/store/destination";
import { useParking } from "@/src/store/parking";
import {
  DAY_CHROME,
  MapChromeContext,
  NIGHT_CHROME,
} from "@/src/components/navigation/glass";
import { colors, radius, spacing } from "@/src/theme";

function formatParkingDistance(meters: number | null) {
  if (meters == null) return "aquí cerca";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

// Pantalla inicial personal, estilo Waze: tu coche, tu destino y tus amigos
// en el mapa para invitarlos al convoy o retarlos. Sin elementos de party.
export default function NavigationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useCurrentUser();
  const live = useLiveLocation();
  const { party, isDemo } = useActiveParty({ poll: true });
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
                !member.isMe && member.lastLat != null && member.lastLng != null,
            )
            .map((member) => ({
              id: member.userId,
              name: member.profile.displayName,
              color: member.color,
              latitude: member.lastLat as number,
              longitude: member.lastLng as number,
              isTalking: false,
            }))
        : [],
    [party, isDemo],
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
  const [recordingNow, setRecordingNow] = useState(() => Date.now());
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [northUp, setNorthUp] = useState(false);
  const lastRerouteAtRef = useRef(0);

  const chosenDestination = useChosenDestination((state) => state.destination);
  const clearChosenDestination = useChosenDestination(
    (state) => state.clearDestination,
  );
  const recentDestinations = useChosenDestination((state) => state.recents);
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
            label: party.destinationLabel ?? "Destino del convoy",
            setBy: party.destinationSetBy,
            setAt: party.destinationSetAt,
          }
        : null,
    [party],
  );

  const route = useGraphHopperRoute({
    origin: live.location,
    destination: destination ?? live.location,
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
  useChallengeRace(
    live.location,
    !isDemo && live.isLive && live.location.source === "gps",
  );
  useLiveShare(live.location, {
    partyId: party && !isDemo ? party.id : null,
    enabled: !isDemo && live.isLive && live.location.source === "gps",
  });
  // Tus amigos te ven en su mapa (si lo permites; se pregunta una vez).
  useEffect(() => {
    if (isDemo || friendCount === 0 || shareWithFriends !== null) return;
    Alert.alert(
      "¿Que tus amigos te vean en el mapa?",
      "Tus amigos verán tu última posición en su mapa, y tú la suya si también lo activan. Puedes cambiarlo en Perfil.",
      [
        { text: "Ahora no", style: "cancel", onPress: () => setShareWithFriends(false) },
        { text: "Compartir", onPress: () => setShareWithFriends(true) },
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
      : String(Math.round(live.location.speedKmh));
  const routeLine = route.route
    ? `${formatRouteDistance(route.route.distanceM)} · ${formatRouteTime(route.route.timeMs)}`
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
  const offRoute = Boolean(
    route.route &&
    routeDistanceFromPathM != null &&
    routeDistanceFromPathM > 80,
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
    route.route && progressM != null
      ? Math.max(0, route.route.distanceM - progressM)
      : null;
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
      ? new Date(clockNow + remainingTimeMs).toLocaleTimeString("es-DO", {
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
      label: "Mi coche",
      personal: true,
    });
    beginNavigation();
  };

  // Acciones sobre un amigo visto en el mapa. Invitar es un toque: si aún
  // no tienes party, se crea y le llega la invitación al momento.
  const inviteToConvoy = async (friend: WorldMapMember) => {
    if (isDemo) {
      Alert.alert(
        "Convoy",
        "Los convoys reales requieren una cuenta conectada.",
      );
      return;
    }
    if (party?.members.some((member) => member.userId === friend.id)) {
      Alert.alert("Convoy", `${friend.name.split(" ")[0]} ya está en tu party.`);
      return;
    }
    try {
      await inviteToParty.mutateAsync({
        partyId: party?.id ?? null,
        userIds: [friend.id],
        myName: me.name,
      });
      Alert.alert(
        "Invitación enviada",
        `${friend.name.split(" ")[0]} la verá al momento. Cuando acepte, aparecerá en tu party.`,
      );
    } catch (error) {
      showError("Convoy", error, "No pudimos invitar.");
    }
  };

  const challengeFriend = (friend: WorldMapMember) => {
    if (isDemo) {
      Alert.alert("Retos", "Los retos reales requieren una cuenta conectada.");
      return;
    }
    // El reto es llegar primero a una meta: sin destino no hay meta.
    const goal = destination ?? partyDestination;
    if (!goal) {
      Alert.alert(
        "Elige la meta",
        "Busca un destino en el mapa y vuelve a retar: gana quien llegue primero ahí.",
      );
      return;
    }
    Alert.alert(
      `Reto a ${friend.name.split(" ")[0]}`,
      "Reto por llegada: gana quien llegue primero al destino, respetando las leyes.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reto",
          style: "destructive",
          onPress: () => {
            void createChallenge
              .mutateAsync({
                title: `Reto: ${friend.name.split(" ")[0]}`,
                category: "mixed",
                mode: "instant",
                fromLabel: "Mi ubicación",
                toLabel: goal.label,
                endLat: goal.latitude,
                endLng: goal.longitude,
                distanceKm: (route.route?.distanceM ?? 0) / 1000,
                rules:
                  "Por llegada: gana quien llegue primero respetando las leyes.",
                hostVehicleId: primaryVehicle?.id,
                hostVehicleKind: primaryVehicle?.kind ?? "car",
                invitees: [{ userId: friend.id, vehicleKind: "car" }],
              })
              .then(() =>
                Alert.alert(
                  "Reto enviado",
                  "Verás la respuesta en la pestaña Retos.",
                ),
              )
              .catch((error: unknown) =>
                showError("Reto", error, "No pudimos crear el reto."),
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
            .map((option, index) => {
              const extra = Math.round((option.timeMs - fastestTimeMs) / 60_000);
              return {
                index,
                coordinates: option.coordinates,
                label: extra > 0 ? `+${extra} min` : "Igual de rápida",
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
          () => Speech.speak(`Has llegado a ${label}`, { language: "es-ES" }),
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
  const partyIdForShare = party && !isDemo ? party.id : null;
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
  const setterName = convoyDestinationSetter?.profile.displayName ?? "Un piloto";

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
  const parkingTint = chrome.day ? "#0891b2" : colors.cyan;

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
              destinationLabel={destination.label}
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
              onClose={clearDestination}
            />
            <View
              pointerEvents="box-none"
              style={[styles.convoyOffer, { bottom: insets.bottom + 150 }]}
            >
              {followTarget ? (
                <View style={[styles.convoyNotice, chrome.surface]}>
                  <Ionicons name="navigate-circle" size={20} color={chrome.text} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" color={chrome.text} numberOfLines={1}>
                      Siguiendo a {followTarget.name.split(" ")[0]}
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
                    accessibilityLabel="Dejar de seguir"
                  >
                    <AppText variant="bodyStrong" color={chrome.muted} style={{ fontSize: 13 }}>
                      Dejar
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
              {convoyNotice ? (
                <View style={[styles.convoyNotice, chrome.surface]} pointerEvents="none">
                  <Ionicons name="flag" size={16} color={chrome.text} />
                  <AppText variant="bodyStrong" color={chrome.text} numberOfLines={2} style={{ flex: 1 }}>
                    {convoyNotice.name} cambió el destino: {convoyNotice.label}
                  </AppText>
                </View>
              ) : null}
              {offerConvoyDestination && partyDestination && !followTarget ? (
                <ConvoyDestinationCard
                  setterName={setterName}
                  label={partyDestination.label}
                  changed
                  onFollow={followConvoyDestination}
                  onDismiss={() => setDismissedConvoyAt(partyDestination.setAt)}
                />
              ) : null}
            </View>
            </>
          ) : (
            <>
              {/* Inicio minimalista: un solo buscador con tu avatar. El vehículo se
                elige en Garaje y la actividad está en el icono del buscador. */}
              {destination == null ? (
                <View style={[styles.searchBar, chrome.surface]}>
                  <Pressable
                    style={styles.searchTap}
                    onPress={() => router.push("/destino" as Href)}
                    accessibilityRole="button"
                    accessibilityLabel="Buscar destino"
                  >
                    <Ionicons name="search" size={20} color="#1a73e8" />
                    <AppText
                      variant="bodyStrong"
                      numberOfLines={1}
                      color={chrome.muted}
                      style={styles.searchText}
                    >
                      ¿A dónde vamos?
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/actividad" as Href)}
                    hitSlop={8}
                    style={styles.searchIcon}
                    accessibilityRole="button"
                    accessibilityLabel="Actividad"
                  >
                    <Ionicons name="pulse" size={20} color={chrome.textSoft} />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/(tabs)/profile")}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Tu perfil"
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
                      accessibilityLabel={`Ir a ${recent.label}`}
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
                      : `SIMULACIÓN · ${PHASE_LABELS[sim.phase]} · ${Math.round(sim.fix?.speedKmh ?? 0)} km/h${
                          sim.party ? " · party" : ""
                        }`}
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
                      OPCIONES
                    </AppText>
                  </Pressable>
                  <Pressable onPress={stopSimulation} hitSlop={8}>
                    <AppText
                      variant="label"
                      color={colors.accent}
                      style={styles.retryText}
                    >
                      PARAR
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
                    Has llegado a {arrivedLabel}
                  </AppText>
                  <Pressable
                    onPress={() => setArrivedLabel(null)}
                    hitSlop={8}
                    accessibilityLabel="Cerrar aviso"
                  >
                    <Ionicons name="close" size={18} color={chrome.muted} />
                  </Pressable>
                </View>
              ) : null}

              {activeTrip ? (
                <View style={[styles.recordingPill, chrome.surface]}>
                  <View style={styles.recordingDot} />
                  <AppText variant="caption" color={chrome.textSoft}>
                    Grabando ruta ·{" "}
                    {Math.max(
                      1,
                      Math.round(
                        (recordingNow - activeTrip.startedAt) / 60_000,
                      ),
                    )}{" "}
                    min ·{" "}
                    {(activeTrip.distanceM / 1000).toFixed(1).replace(".", ",")}{" "}
                    km
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
                        "Coche aparcado",
                        "¿Olvidar la ubicación guardada?",
                        [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: "Olvidar",
                            style: "destructive",
                            onPress: clearParking,
                          },
                        ],
                      )
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
                      Tu coche aparcado ·{" "}
                      {formatParkingDistance(parkingDistance)}
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
                  <AppText
                    variant="caption"
                    color={chrome.textSoft}
                    numberOfLines={2}
                    style={styles.bannerText}
                  >
                    {live.message}
                  </AppText>
                  {live.status !== "locating" ? (
                    <Pressable onPress={live.retry} hitSlop={8}>
                      <AppText
                        variant="label"
                        color={chrome.day ? "#2f8cff" : colors.lime}
                        style={styles.retryText}
                      >
                        REINTENTAR
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
                      color={chrome.day ? "#2f8cff" : colors.lime}
                      style={styles.retryText}
                    >
                      REINTENTAR
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
                    options={routeOptions}
                    selected={route.selected}
                    canConfirm={!route.isLoading && Boolean(route.route)}
                    bottomInset={0}
                    onRetry={retryRoute}
                    onSelect={selectRoute}
                    onConfirm={beginNavigation}
                    onShare={() => void shareRouteLink()}
                    onClose={clearDestination}
                  />
                ) : null}

                {offerConvoyDestination && partyDestination ? (
                  <ConvoyDestinationCard
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
                        ? "En tu party"
                        : party
                          ? "Invitar a mi party"
                          : "Crear party e invitar"
                    }
                    onInvite={() => void inviteToConvoy(selectedFriend)}
                    onChallenge={() => challengeFriend(selectedFriend)}
                    onFollow={
                      party?.members.some((member) => member.userId === selectedFriend.id) ||
                      simMembers.some((member) => member.id === selectedFriend.id)
                        ? () => {
                            useFollow
                              .getState()
                              .follow({ id: selectedFriend.id, name: selectedFriend.name });
                            setSelectedFriend(null);
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
    </View>
  );
}

const styles = StyleSheet.create({
  convoyOffer: { position: "absolute", left: spacing.lg, right: spacing.lg, gap: spacing.sm },
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
