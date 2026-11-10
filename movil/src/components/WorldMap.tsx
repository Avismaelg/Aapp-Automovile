import { Ionicons } from "@expo/vector-icons";
import Mapbox, {
  Atmosphere,
  BackgroundLayer,
  Camera,
  CircleLayer,
  FillLayer,
  CustomLocationProvider,
  LineLayer,
  LocationPuck,
  MapView,
  MarkerView,
  ModelLayer,
  ShapeSource,
  SymbolLayer,
  UserTrackingMode,
  VectorSource,
} from "@rnmapbox/maps";
import * as Location from "expo-location";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  findNodeHandle,
  Platform,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";

import { addModel, resetPuck, setModelPuck } from "@/modules/car-puck";

import { useCarModel } from "@/src/hooks/useCarModel";
import { useMapTheme } from "@/src/hooks/useMapTheme";
import { useSmoothMembers } from "@/src/hooks/useSmoothMembers";
import { useSimulator } from "@/src/lib/simulator";
import { navCamera } from "@/src/lib/nav-camera";
import {
  MAP_FALLBACK_STYLES,
  MAPBOX_ACCESS_TOKEN,
  NATIVE_LABEL_LAYER,
  NATIVE_MAP_STYLES,
} from "@/src/lib/map/config";
import type {
  WorldMapAlternative,
  WorldMapDestination,
  WorldMapLocation,
  WorldMapMember,
  WorldMapParking,
  WorldMapRoute,
  WorldMapTravelMode,
  WorldMapVehicleKind,
} from "@/src/lib/map-html";
import {
  cumulativeDistances,
  metersBetween,
  nextInstruction,
  routeProgress,
} from "@/src/lib/route-instructions";
import { trafficGradient } from "@/src/lib/route-traffic";
import { colors } from "@/src/theme";
import { formatDistance, t } from "@/src/i18n";

// Mapa nativo (Mapbox Maps SDK v11 vía @rnmapbox/maps): la cámara de
// seguimiento y el indicador de posición los anima el motor nativo a 60 fps.
// En web se usa WorldMap.web.tsx (MapLibre GL JS).
Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN || null);

const NO_ALTERNATIVES: WorldMapAlternative[] = [];
// Los amigos se dibujan en capas del propio mapa (GPU): aguantan cientos sin
// trabas y quedan por debajo de los textos y botones de la pantalla (los
// marcadores nativos se pintaban encima). Juntos se agrupan en «+N».
const MEMBER_FONT = ["DIN Pro Medium", "Arial Unicode MS Regular"];
// Grosor de la ruta según el zoom (más fina de lejos, ancha al conducir).
const ROUTE_WIDTH: unknown = ["interpolate", ["linear"], ["zoom"], 10, 4, 13, 7, 16, 12, 18, 18];
const ROUTE_WIDTH_GLOW: unknown = ["interpolate", ["linear"], ["zoom"], 10, 10, 13, 16, 16, 26, 18, 36];
const ROUTE_WIDTH_ALT: unknown = ["interpolate", ["linear"], ["zoom"], 10, 3, 13, 5, 16, 8, 18, 12];

// Capas de relleno del estilo nocturno que se pasan a negro OLED.
const OLED_FILLS: [string, string][] = [
  ["landcover", "#050506"],
  ["national-park", "#06090A"],
  ["landuse", "#060607"],
  ["land-structure-polygon", "#000000"],
  ["water", "#07101C"],
  ["building", "#111114"],
];

const NO_STOPS: { latitude: number; longitude: number; label: string }[] = [];

// Degradado de una curva a lo largo de su zona (0 = entrada, 1 = salida): del
// azul de la ruta al rojo en el punto más lento (el centro) y de vuelta.
const ROUTE_BLUE = "#3d9bff";
const CURVE_GRADIENT_BRAKE: unknown = [
  "interpolate", ["linear"], ["line-progress"],
  0, ROUTE_BLUE, 0.22, "#F5B014", 0.5, "#E5243F", 0.78, "#F5B014", 1, ROUTE_BLUE,
];
const CURVE_GRADIENT_EASE: unknown = [
  "interpolate", ["linear"], ["line-progress"],
  0, ROUTE_BLUE, 0.35, "#F5B014", 0.65, "#F5B014", 1, ROUTE_BLUE,
];

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const OPENFREEMAP_LABEL_LAYER = {
  day: "waterway_line_label",
  night: "place_other",
};
// Halo del punto azul (a pie o sin coche 3D).
const PUCK_PULSING = {
  isEnabled: true,
  color: "#3d9bff",
  radius: "accuracy",
} as const;
const NO_PADDING = {
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
};
// Capas de tráfico del estilo de navegación de Mapbox. Por defecto pintan de
// verde las calles sin atasco; aquí solo se colorean las retenciones, como
// en Google Maps.
const TRAFFIC_LAYERS = [
  "traffic-tunnel-link-navigation",
  "traffic-tunnel-minor-navigation",
  "traffic-tunnel-street-navigation",
  "traffic-tunnel-secondary-tertiary-navigation",
  "traffic-tunnel-primary-navigation",
  "traffic-tunnel-major-link-navigation",
  "traffic-tunnel-motorway-trunk-navigation",
  "traffic-bridge-road-link-navigation",
  "traffic-bridge-road-minor-navigation",
  "traffic-bridge-road-street-navigation",
  "traffic-bridge-road-secondary-tertiary-navigation",
  "traffic-bridge-road-primary-navigation",
  "traffic-bridge-road-major-link-navigation",
  "traffic-bridge-road-motorway-trunk-navigation",
];
const TRAFFIC_COLOR: unknown = [
  "match",
  ["get", "congestion"],
  "moderate",
  "#f59e0b",
  "heavy",
  "#ef4444",
  "severe",
  "#991b1b",
  "rgba(0,0,0,0)",
];

// Tráfico propio sobre todas las calles (no solo puentes y túneles, que era lo
// único que coloreaba el estilo y se veía como una rayita): la carretera
// entera en naranja / rojo / granate según el atasco, como en Google Maps.
const TRAFFIC_TILES = "mapbox://mapbox.mapbox-traffic-v1";
const TRAFFIC_FILTER: unknown = ["in", ["get", "congestion"], ["literal", ["moderate", "heavy", "severe"]]];
const TRAFFIC_WIDTH: unknown = [
  "interpolate", ["exponential", 1.5], ["zoom"],
  10, 1.5,
  13, 3.5,
  16, 8,
  19, 18,
];
const TRAFFIC_OPACITY: unknown = ["interpolate", ["linear"], ["zoom"], 9, 0.55, 13, 0.9];

// Coche 3D como indicador de posición (Android): tamaño fijo en pantalla
// (~45 pt de largo) y giro para que el morro apunte hacia la marcha.
const PUCK_SCALE = 11;
const PUCK_ROTATION = 270;
// El coche aparcado está en el mapa (metros): para que mida ~45 pt a
// cualquier zoom, la escala se duplica por cada nivel que te alejas. Va por
// escalones de medio nivel porque Mapbox no interpola listas.
const PARKED_SCALE: unknown = [
  "step",
  ["zoom"],
  ["literal", [184.0, 184.0, 184.0]],
  12.5,
  ["literal", [130.11, 130.11, 130.11]],
  13,
  ["literal", [92.0, 92.0, 92.0]],
  13.5,
  ["literal", [65.05, 65.05, 65.05]],
  14,
  ["literal", [46.0, 46.0, 46.0]],
  14.5,
  ["literal", [32.53, 32.53, 32.53]],
  15,
  ["literal", [23.0, 23.0, 23.0]],
  15.5,
  ["literal", [16.26, 16.26, 16.26]],
  16,
  ["literal", [11.5, 11.5, 11.5]],
  16.5,
  ["literal", [8.13, 8.13, 8.13]],
  17,
  ["literal", [5.75, 5.75, 5.75]],
  17.5,
  ["literal", [4.07, 4.07, 4.07]],
  18,
  ["literal", [2.88, 2.88, 2.88]],
  18.5,
  ["literal", [2.03, 2.03, 2.03]],
  19,
  ["literal", [1.44, 1.44, 1.44]],
  19.5,
  ["literal", [1.02, 1.02, 1.02]],
  20,
  ["literal", [0.72, 0.72, 0.72]],
];

type WorldMapProps = {
  members: WorldMapMember[];
  destination?: WorldMapDestination | null;
  location: WorldMapLocation;
  parking?: WorldMapParking | null;
  travelMode?: WorldMapTravelMode;
  northUp?: boolean;
  fitRoute?: [number, number][] | null;
  // Paradas de la ruta (marcadores numerados).
  stops?: { latitude: number; longitude: number; label: string }[];
  // Alto de lo que tapa el mapa por abajo (tarjetas), para encuadrar la ruta.
  fitBottom?: number;
  autoFollow?: boolean;
  route?: WorldMapRoute | null;
  alternatives?: WorldMapAlternative[];
  vehicleColor?: string;
  vehicleKind?: WorldMapVehicleKind;
  recenterToken?: number;
  // Alto de lo que tapa el borde inferior del mapa (tarjetas): el logo de
  // Mapbox se coloca justo encima para que siempre se vea.
  ornamentBottom?: number;
  // Línea de conducción (tramos con propiedad level: go, ease o brake).
  drivingLine?: GeoJSON.FeatureCollection | null;
  // Lleva la cámara a un punto (p. ej. el coche aparcado); token cambia en cada toque.
  focus?: { latitude: number; longitude: number; token: number } | null;
  // Intro: la cámara empieza en el espacio (globo con estrellas) y vuela hasta
  // tu posición pasados flightDelayMs; al aterrizar llama a onIntroEnd.
  intro?: { earthAtMs: number; earthMs: number; flightAtMs: number; flightMs: number } | null;
  onIntroEnd?: () => void;
  onFollowChange?: (following: boolean) => void;
  onMemberPress?: (memberId: string) => void;
  onAlternativePress?: (index: number) => void;
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

// Zoom según la velocidad: cerca en ciudad, más abierto en autopista y más
// cerca aún al acercarse a una maniobra.
function toLngLat(point: [number, number]): [number, number] {
  return [point[1], point[0]];
}

function line(
  coordinates: [number, number][],
  properties: GeoJSON.GeoJsonProperties = {},
): GeoJSON.Feature {
  return {
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates: coordinates.map(toLngLat) },
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

// Esquinas noreste y suroeste en [longitud, latitud], como pide fitBounds.
function cornersOf(points: [number, number][]) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lat, lng] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { ne: [east, north], sw: [west, south] };
}

// El indicador nativo lee el GPS por su cuenta: solo se activa con permiso.
// Solo consulta el permiso, nunca lo pide (eso lo hace useLiveLocation).
function useLocationPermission() {
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    // Concedido: ya no hay nada que vigilar (antes el intervalo seguía para siempre).
    if (granted) return;
    let active = true;
    const check = () =>
      Location.getForegroundPermissionsAsync()
        .then((result) => {
          if (active) setGranted(result.granted);
        })
        .catch(() => {});
    void check();
    const timer = setInterval(() => void check(), 5_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [granted]);
  return granted;
}

export const WorldMap = memo(function WorldMap({
  members,
  destination = null,
  location,
  parking = null,
  travelMode = "car",
  northUp = false,
  fitRoute = null,
  stops = NO_STOPS,
  fitBottom = 280,
  autoFollow = true,
  route = null,
  alternatives = NO_ALTERNATIVES,
  vehicleColor = "#ff5a1f",
  recenterToken = 0,
  ornamentBottom = 4,
  drivingLine = null,
  focus = null,
  intro = null,
  onIntroEnd,
  onFollowChange,
  onMemberPress,
  onAlternativePress,
  onError,
  style,
}: WorldMapProps) {
  const cameraRef = useRef<Camera>(null);
  const mapRef = useRef<MapView>(null);
  const carModel = useCarModel(vehicleColor);
  // Un id por color: Mapbox no recarga un modelo ya registrado con el mismo id.
  // Sale del archivo (que lleva el color), no del color pedido: el archivo
  // nuevo llega un momento después.
  const carModelId = `caravana-${(carModel ?? "car").split("/").pop()}`;
  const simulating = useSimulator((state) => state.active);
  const theme = useMapTheme(location);
  const hasPermission = useLocationPermission();
  const [styleFailed, setStyleFailed] = useState(false);
  const [introRunning, setIntroRunning] = useState(Boolean(intro));
  const [userFollowing, setFollowing] = useState(autoFollow);
  const callbacksRef = useRef({
    onFollowChange,
    onMemberPress,
    onAlternativePress,
    onError,
    onIntroEnd,
  });
  const walking = travelMode === "walking";
  const following = autoFollow && userFollowing;

  useEffect(() => {
    callbacksRef.current = {
      onFollowChange,
      onMemberPress,
      onAlternativePress,
      onError,
      onIntroEnd,
    };
  }, [onFollowChange, onMemberPress, onAlternativePress, onError, onIntroEnd]);

  const followingRef = useRef(autoFollow);
  const changeFollowing = useCallback((value: boolean) => {
    if (followingRef.current === value) return;
    followingRef.current = value;
    setFollowing(value);
    callbacksRef.current.onFollowChange?.(value);
  }, []);

  useEffect(() => {
    if (recenterToken > 0) changeFollowing(true);
  }, [recenterToken, changeFollowing]);

  // Vista general de una ruta: deja de seguir y encuadra todo el trazado.
  useEffect(() => {
    if (!fitRoute || fitRoute.length < 2) return;
    changeFollowing(false);
    const timer = setTimeout(() => {
      const { ne, sw } = cornersOf(fitRoute);
      // Relleno [arriba, derecha, abajo, izquierda]: deja sitio a las tarjetas.
      // Laterales amplios: el velocímetro y los botones tapan los bordes.
      cameraRef.current?.fitBounds(ne, sw, [160, 90, fitBottom, 90], 900);
    }, 50);
    return () => clearTimeout(timer);
    // El alto de las tarjetas cambia mientras cargan: solo se encuadra con
    // cada ruta nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRoute, changeFollowing]);

  useEffect(() => {
    if (!focus) return;
    changeFollowing(false);
    cameraRef.current?.setCamera({
      centerCoordinate: [focus.longitude, focus.latitude],
      zoomLevel: 17.5,
      heading: 0,
      animationMode: "flyTo",
      animationDuration: 1200,
    });
    // Solo al pedirlo (token), no cuando cambian las coordenadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token, changeFollowing]);

  // Sin permiso de GPS (o en la demo) se centra en la posición que da la app.
  const lastCenteredRef = useRef("");
  useEffect(() => {
    if (!following || hasPermission) return;
    const key = `${location.latitude.toFixed(5)}|${location.longitude.toFixed(5)}`;
    if (key === lastCenteredRef.current) return;
    lastCenteredRef.current = key;
    cameraRef.current?.setCamera({
      centerCoordinate: [location.longitude, location.latitude],
      animationMode: "easeTo",
      animationDuration: 600,
    });
  }, [following, hasPermission, location.latitude, location.longitude]);

  const cumulative = useMemo(
    () =>
      route && route.coordinates.length >= 2
        ? cumulativeDistances(route.coordinates)
        : null,
    [route],
  );
  const progress = useMemo(
    () =>
      route && cumulative
        ? routeProgress(route.coordinates, cumulative, location)
        : null,
    [route, cumulative, location],
  );
  // La ruta se sube una vez; lo recorrido se oculta con un recorte que
  // avanza de forma continua (antes la ruta entera se rehacía en cada punto).
  const routeData = useMemo<GeoJSON.FeatureCollection>(
    () =>
      route && route.coordinates.length >= 2
        ? { type: "FeatureCollection", features: [line(route.coordinates)] }
        : EMPTY,
    [route],
  );
  // Ruta pintada por tráfico (naranja / rojo donde hay retención).
  const routeGradient = useMemo(() => trafficGradient(route?.traffic, "#3d9bff"), [route]);
  const routeLength = cumulative ? cumulative[cumulative.length - 1] : 0;
  // En pasos de 0,1 % para no tocar el estilo con cada metro.
  const traveled =
    progress && routeLength > 0
      ? Math.min(0.999, Math.round((progress.progressM / routeLength) * 1000) / 1000)
      : 0;

  // Tramo final a pie: si la calle no llega justo al destino, una línea de
  // puntos une el final de la ruta con el sitio exacto.
  const lastMileData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!route || !destination || route.coordinates.length < 2) return EMPTY;
    const end = route.coordinates[route.coordinates.length - 1];
    const target: [number, number] = [destination.latitude, destination.longitude];
    const gap = Math.hypot(
      (end[0] - target[0]) * 110_540,
      (end[1] - target[1]) * 111_320 * Math.cos((end[0] * Math.PI) / 180),
    );
    return gap > 25 ? { type: "FeatureCollection", features: [line([end, target])] } : EMPTY;
  }, [route, destination]);

  const stopsData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: stops.map((stop, index) => ({
        type: "Feature",
        properties: { number: String(index + 1), label: stop.label },
        geometry: { type: "Point", coordinates: [stop.longitude, stop.latitude] },
      })),
    }),
    [stops],
  );

  const alternativesData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: alternatives
        .filter((item) => item.coordinates.length >= 2)
        .map((item) =>
          line(item.coordinates, { index: item.index, label: item.label ?? "" }),
        ),
    }),
    [alternatives],
  );

  // Punto de la próxima maniobra (un círculo blanco sobre la ruta).
  const upcoming = useMemo(
    () =>
      route && progress
        ? nextInstruction(route.instructions, progress.progressM)
        : null,
    [route, progress],
  );
  // Flecha de la próxima maniobra: 35 m antes y 20 m después del giro, en
  // blanco sobre la ruta (como los navegadores de coche).
  const maneuverData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!route || !cumulative || !upcoming) return EMPTY;
    if (upcoming.icon === "depart" || upcoming.icon === "straight" || upcoming.icon === "arrive")
      return EMPTY;
    const from = upcoming.atDistanceM - 35;
    const to = upcoming.atDistanceM + 20;
    const points = route.coordinates.filter(
      (_, index) => cumulative[index] >= from && cumulative[index] <= to,
    );
    const at = cumulative.findIndex((value) => value >= upcoming.atDistanceM);
    const center = route.coordinates[at < 0 ? route.coordinates.length - 1 : at];
    const features: GeoJSON.Feature[] = [
      {
        type: "Feature",
        properties: { kind: "point" },
        geometry: { type: "Point", coordinates: toLngLat(center) },
      },
    ];
    if (points.length >= 2) features.push(line(points, { kind: "arrow" }));
    return { type: "FeatureCollection", features };
  }, [route, cumulative, upcoming]);

  const parkingDistance = parking
    ? Math.round(metersBetween(location, parking))
    : null;
  const parkingKey =
    parking && parkingDistance != null && parkingDistance > 40
      ? `${parking.latitude}|${parking.longitude}|${Math.round(location.latitude * 5000)}|${Math.round(location.longitude * 5000)}`
      : "";
  const parkingLineData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!parkingKey || !parking) return EMPTY;
    return {
      type: "FeatureCollection",
      features: [
        line([
          [location.latitude, location.longitude],
          [parking.latitude, parking.longitude],
        ]),
      ],
    };
    // La línea se rehace al moverse ~20 m (parkingKey), no con cada señal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkingKey]);

  const { height: windowHeight } = useWindowDimensions();
  const speedKmh = location.speedKmh ?? 0;
  const headingUp = !northUp && !walking;
  const camera = navCamera({
    speedKmh,
    walking,
    driving: headingUp,
    maneuverM: upcoming?.remainingM,
  });
  // En vista inclinada el coche va abajo, para ver más calle por delante.
  const followPadding = useMemo(
    () =>
      camera.topPaddingRatio > 0
        ? {
            paddingTop: Math.round(windowHeight * camera.topPaddingRatio),
            paddingRight: 0,
            paddingBottom: 0,
            paddingLeft: 0,
          }
        : NO_PADDING,
    [camera.topPaddingRatio, windowHeight],
  );
  const tracking = following && hasPermission && !introRunning;

  // Cambia el punto azul por el coche 3D. Mapbox recrea su indicador al
  // cargar un estilo, así que se vuelve a aplicar en cada carga.
  const [styleLoads, setStyleLoads] = useState(0);
  const useCarPuck =
    Platform.OS === "android" && !walking && hasPermission && carModel != null;
  // Si el coche 3D no se pudo poner se reintenta cada 3 s y al volver la app
  // a primer plano (en segundo plano el mapa no está en pantalla y falla).
  // No se monta el punto de rnmapbox como respaldo: al desmontarse apaga el
  // indicador nativo entero, coche incluido.
  const [retryTick, setRetryTick] = useState(0);
  const puckIsModelRef = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setRetryTick((tick) => tick + 1);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (Platform.OS !== "android" || !carModel || styleLoads === 0) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      const tag = findNodeHandle(mapRef.current);
      if (tag == null) return;
      // El modelo del coche aparcado se registra en cada estilo cargado.
      void addModel(tag, carModelId, carModel);
      if (useCarPuck) {
        void setModelPuck(tag, carModel, PUCK_SCALE, PUCK_ROTATION).then(
          (applied) => {
            puckIsModelRef.current = applied;
            if (!applied)
              retry = setTimeout(() => setRetryTick((tick) => tick + 1), 3_000);
          },
        );
      } else if (puckIsModelRef.current) {
        // A pie: el coche se queda aparcado y tú vuelves a ser el punto azul.
        void resetPuck(tag).then((reset) => {
          if (reset) puckIsModelRef.current = false;
        });
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      if (retry) clearTimeout(retry);
    };
  }, [useCarPuck, carModel, carModelId, styleLoads, retryTick]);
  const handleStyleLoaded = useCallback(
    () => setStyleLoads((count) => count + 1),
    [],
  );

  // Vuelo de la intro: espera al estilo (para no volar sobre un mapa vacío) y
  // al momento en que la galaxia ya llena la pantalla.
  const introStartedAt = useState(() => Date.now())[0];
  const introRef = useRef(intro);
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);
  useEffect(() => {
    const plan = introRef.current;
    if (!introRunning || !plan || styleLoads === 0) return;
    // Si el estilo tarda, toda la secuencia se retrasa igual.
    const elapsed = Date.now() - introStartedAt;
    const delay = Math.max(0, plan.earthAtMs - elapsed);
    // 1) La Tierra gira hasta tu lado del planeta.
    const spin = setTimeout(() => {
      const here = locationRef.current;
      cameraRef.current?.setCamera({
        centerCoordinate: [here.longitude, here.latitude * 0.6],
        zoomLevel: 1.4,
        animationMode: "easeTo",
        animationDuration: plan.earthMs,
      });
    }, delay);
    // 2) Desde el espacio hasta tu calle.
    const flightAt = delay + (plan.flightAtMs - plan.earthAtMs);
    const fly = setTimeout(() => {
      const here = locationRef.current;
      cameraRef.current?.setCamera({
        centerCoordinate: [here.longitude, here.latitude],
        zoomLevel: 15.5,
        pitch: 0,
        heading: 0,
        animationMode: "flyTo",
        animationDuration: plan.flightMs,
      });
    }, flightAt);
    const land = setTimeout(() => {
      setIntroRunning(false);
      callbacksRef.current.onIntroEnd?.();
    }, flightAt + plan.flightMs + 150);
    return () => {
      clearTimeout(spin);
      clearTimeout(fly);
      clearTimeout(land);
    };
  }, [introRunning, styleLoads, introStartedAt]);

  const handleTrackingChange = useCallback(
    (event: { nativeEvent: { payload: { followUserLocation: boolean } } }) => {
      // El motor suelta el seguimiento cuando el usuario arrastra el mapa.
      if (!event.nativeEvent.payload.followUserLocation) changeFollowing(false);
    },
    [changeFollowing],
  );

  const handleAlternativePress = useCallback(
    (event: { features: GeoJSON.Feature[] }) => {
      const index = event.features[0]?.properties?.index;
      if (typeof index === "number")
        callbacksRef.current.onAlternativePress?.(index);
    },
    [],
  );


  // Tocar un amigo abre su ficha; tocar un grupo acerca el mapa.
  const handleMembersPress = useCallback(
    (event: { features: GeoJSON.Feature[] }) => {
      const feature = event.features[0];
      if (!feature) return;
      const id = feature.properties?.id;
      if (typeof id === "string") {
        callbacksRef.current.onMemberPress?.(id);
        return;
      }
      if (feature.geometry.type !== "Point") return;
      const center = feature.geometry.coordinates as [number, number];
      changeFollowing(false);
      void (async () => {
        const zoom = (await mapRef.current?.getZoom().catch(() => null)) ?? 13;
        cameraRef.current?.setCamera({
          centerCoordinate: center,
          zoomLevel: Math.min(18, zoom + 2),
          animationMode: "easeTo",
          animationDuration: 500,
        });
      })();
    },
    [changeFollowing],
  );

  const handleStyleError = useCallback(() => {
    setStyleFailed((failed) => {
      if (!failed)
        callbacksRef.current.onError?.(
          t('No pudimos cargar el mapa. Probamos con el mapa de respaldo.'),
        );
      return true;
    });
  }, []);

  const usingMapbox = Boolean(MAPBOX_ACCESS_TOKEN) && !styleFailed;
  const styleURL = (styleFailed ? MAP_FALLBACK_STYLES : NATIVE_MAP_STYLES)[
    theme
  ];
  const belowLayerID = (
    styleFailed ? OPENFREEMAP_LABEL_LAYER : NATIVE_LABEL_LAYER
  )[theme];
  const night = theme === "night";

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: night ? "#0b0f14" : "#e9edf1" },
        style,
      ]}
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        styleURL={styleURL}
        projection={introRunning ? "globe" : "mercator"}
        pitchEnabled={false}
        logoPosition={{ bottom: ornamentBottom, left: 8 }}
        attributionPosition={{ bottom: ornamentBottom, left: 96 }}
        compassEnabled={false}
        scaleBarEnabled={false}
        onMapLoadingError={handleStyleError}
        onDidFinishLoadingStyle={handleStyleLoaded}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={
            introRunning
              ? {
                  // Empieza mirando el otro lado del planeta para verlo girar.
                  centerCoordinate: [location.longitude - 110, 10],
                  zoomLevel: 0.9,
                }
              : {
                  centerCoordinate: [location.longitude, location.latitude],
                  zoomLevel: 15,
                }
          }
          followUserLocation={tracking}
          followUserMode={
            headingUp
              ? UserTrackingMode.FollowWithCourse
              : UserTrackingMode.Follow
          }
          followZoomLevel={camera.zoom}
          followPitch={camera.pitch}
          followHeading={headingUp ? undefined : 0}
          followPadding={followPadding}
          onUserTrackingModeChange={handleTrackingChange}
        />

        {introRunning ? (
          <Atmosphere
            style={{
              color: night ? "#1b2440" : "#bcd3f5",
              highColor: night ? "#123a8a" : "#4d8cff",
              horizonBlend: 0.06,
              spaceColor: "#000000",
              starIntensity: 0.7,
            }}
          />
        ) : null}

        {usingMapbox ? (
          <VectorSource id="caravana-traffic" url={TRAFFIC_TILES}>
            <LineLayer
              id="caravana-traffic-line"
              sourceLayerID="traffic"
              belowLayerID={belowLayerID}
              filter={TRAFFIC_FILTER as never}
              style={{
                lineCap: "round",
                lineJoin: "round",
                lineColor: TRAFFIC_COLOR as string,
                lineWidth: TRAFFIC_WIDTH as number,
                lineOpacity: TRAFFIC_OPACITY as number,
                lineEmissiveStrength: 1,
              }}
            />
          </VectorSource>
        ) : null}

        <ShapeSource
          id="caravana-alternatives"
          shape={alternativesData}
          onPress={handleAlternativePress}
        >
          <LineLayer
            id="caravana-alt-line"
            belowLayerID={belowLayerID}
            style={{
              lineCap: "round",
              lineJoin: "round",
              lineColor: night ? "#5d6b7d" : "#a9b6c6",
              lineBorderColor: night ? "#2a3442" : "#7b8899",
              lineBorderWidth: 1.5,
              lineEmissiveStrength: 1,
              lineWidth: ROUTE_WIDTH_ALT as number,
            }}
          />
          <SymbolLayer
            id="caravana-alt-label"
            style={{
              symbolPlacement: "line-center",
              textField: ["to-string", ["get", "label"]],
              textFont: MEMBER_FONT,
              textSize: 13,
              textColor: night ? "#e6ebf1" : "#1f2a37",
              textHaloColor: night ? "#1b2330" : "#ffffff",
              textHaloWidth: 2,
              textAllowOverlap: false,
            }}
          />
        </ShapeSource>

        <ShapeSource id="caravana-route" shape={routeData} lineMetrics>
          {/* Halo suave bajo la ruta: se ve sobre cualquier fondo. */}
          <LineLayer
            id="caravana-route-glow"
            belowLayerID={belowLayerID}
            style={{
              lineCap: "round",
              lineJoin: "round",
              lineColor: "#3d9bff",
              lineOpacity: night ? 0.35 : 0.22,
              lineBlur: 6,
              lineEmissiveStrength: 1,
              lineWidth: ROUTE_WIDTH_GLOW as number,
              lineTrimOffset: [0, traveled],
            }}
          />
          <LineLayer
            id="caravana-route-line"
            belowLayerID={belowLayerID}
            style={{
              lineCap: "round",
              lineJoin: "round",
              lineColor: "#3d9bff",
              ...(routeGradient ? { lineGradient: routeGradient as string } : null),
              lineBorderColor: "#1458b8",
              lineBorderWidth: 2.5,
              // Que la luz de noche del mapa no la apague.
              lineEmissiveStrength: 1,
              lineWidth: ROUTE_WIDTH as number,
              lineTrimOffset: [0, traveled],
            }}
          />
          {/* Flechas de sentido a lo largo de la ruta. */}
          <SymbolLayer
            id="caravana-route-chevrons"
            minZoomLevel={13}
            style={{
              symbolPlacement: "line",
              symbolSpacing: 90,
              textField: "›",
              textFont: MEMBER_FONT,
              textSize: ["interpolate", ["linear"], ["zoom"], 13, 14, 17, 22],
              textColor: "#ffffff",
              textOpacity: 0.85,
              textKeepUpright: false,
              textRotationAlignment: "map",
              textPitchAlignment: "map",
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </ShapeSource>

        <ShapeSource id="caravana-stops" shape={stopsData}>
          <CircleLayer
            id="caravana-stop-dots"
            style={{
              circleRadius: 13,
              circleColor: "#f59e0b",
              circleStrokeColor: "#ffffff",
              circleStrokeWidth: 2.5,
              circleEmissiveStrength: 1,
            }}
          />
          <SymbolLayer
            id="caravana-stop-numbers"
            style={{
              textField: ["to-string", ["get", "number"]],
              textFont: MEMBER_FONT,
              textSize: 13,
              textColor: "#ffffff",
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
          <SymbolLayer
            id="caravana-stop-labels"
            minZoomLevel={11}
            style={{
              textField: ["to-string", ["get", "label"]],
              textFont: MEMBER_FONT,
              textSize: 12,
              textOffset: [0, 1.6],
              textAnchor: "top",
              textColor: night ? "#f3f6fa" : "#0b1422",
              textHaloColor: night ? "#0b1422" : "#ffffff",
              textHaloWidth: 1.5,
            }}
          />
        </ShapeSource>

        <ShapeSource id="caravana-last-mile" shape={lastMileData}>
          <LineLayer
            id="caravana-last-mile"
            belowLayerID={belowLayerID}
            style={{
              lineCap: "round",
              lineColor: "#3d9bff",
              lineWidth: 4,
              lineDasharray: [0.1, 2],
              lineEmissiveStrength: 1,
            }}
          />
        </ShapeSource>

        {/* Curvas por delante: del ancho de la ruta, con degradado azul →
            ámbar → rojo en el punto más lento y vuelta a azul, y un disco con
            la velocidad recomendada (rojo: frena; ámbar: levanta el pie). */}
        <ShapeSource id="caravana-driving-line" shape={drivingLine ?? EMPTY} lineMetrics>
          <LineLayer
            id="caravana-curve-brake"
            belowLayerID={belowLayerID}
            filter={["all", ["==", ["get", "kind"], "curve"], ["==", ["get", "level"], "brake"]]}
            style={{
              lineCap: "round",
              lineJoin: "round",
              lineWidth: ROUTE_WIDTH as number,
              lineBorderColor: "#1458b8",
              lineBorderWidth: 2.5,
              lineEmissiveStrength: 1,
              lineGradient: CURVE_GRADIENT_BRAKE as string,
            }}
          />
          <LineLayer
            id="caravana-curve-ease"
            belowLayerID={belowLayerID}
            filter={["all", ["==", ["get", "kind"], "curve"], ["==", ["get", "level"], "ease"]]}
            style={{
              lineCap: "round",
              lineJoin: "round",
              lineWidth: ROUTE_WIDTH as number,
              lineBorderColor: "#1458b8",
              lineBorderWidth: 2.5,
              lineEmissiveStrength: 1,
              lineGradient: CURVE_GRADIENT_EASE as string,
            }}
          />
        </ShapeSource>

        <ShapeSource id="caravana-maneuver" shape={maneuverData}>
          <LineLayer
            id="caravana-maneuver-arrow"
            filter={["==", ["get", "kind"], "arrow"]}
            style={{
              lineCap: "round",
              lineJoin: "round",
              lineColor: "#ffffff",
              lineBorderColor: "#0b3b80",
              lineBorderWidth: 2,
              lineEmissiveStrength: 1,
              lineWidth: ["interpolate", ["linear"], ["zoom"], 13, 4, 16, 8, 18, 12],
            }}
          />
          <CircleLayer
            id="caravana-maneuver"
            filter={["==", ["get", "kind"], "point"]}
            style={{
              circleRadius: ["interpolate", ["linear"], ["zoom"], 13, 4, 17, 7],
              circleColor: "#ffffff",
              circleStrokeColor: "#0b3b80",
              circleStrokeWidth: 3,
              circleEmissiveStrength: 1,
            }}
          />
        </ShapeSource>

        {/* El disco de la velocidad de la curva, por encima de la flecha de
            giro (si coinciden, la velocidad es lo que importa). */}
        <ShapeSource id="caravana-curve-badges" shape={drivingLine ?? EMPTY}>
          <CircleLayer
            id="caravana-curve-badge"
            filter={["==", ["get", "kind"], "badge"]}
            style={{
              circleRadius: ["interpolate", ["linear"], ["zoom"], 13, 11, 17, 16],
              circleColor: "#ffffff",
              circleStrokeColor: ["case", ["==", ["get", "level"], "brake"], "#E5243F", "#F5B014"],
              circleStrokeWidth: ["interpolate", ["linear"], ["zoom"], 13, 3, 17, 4],
              circleEmissiveStrength: 1,
              circlePitchAlignment: "viewport",
            }}
          />
          <SymbolLayer
            id="caravana-curve-speed"
            filter={["==", ["get", "kind"], "badge"]}
            style={{
              textField: ["to-string", ["get", "speed"]],
              textFont: MEMBER_FONT,
              textSize: ["interpolate", ["linear"], ["zoom"], 13, 11, 17, 15],
              textColor: "#0b0f14",
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </ShapeSource>

        <ShapeSource id="caravana-parking-line" shape={parkingLineData}>
          <LineLayer
            id="caravana-parking-line"
            belowLayerID={belowLayerID}
            style={{
              lineCap: "round",
              lineJoin: "round",
              lineColor: "#FF6A33",
              lineWidth: 4,
              lineDasharray: [2, 2],
              lineOpacity: 0.9,
            }}
          />
        </ShapeSource>

        {/* Negro OLED de noche: el estilo de navegación nocturno de Mapbox
            es gris pizarra; se oscurecen su fondo, terrenos y edificios (las
            calles quedan en gris sobre negro). */}
        {usingMapbox && night ? (
          <>
            <BackgroundLayer key="oled-land" id="land" existing style={{ backgroundColor: "#000000" }} />
            {OLED_FILLS.map(([id, color]) => (
              <FillLayer key={`oled-${id}`} id={id} existing style={{ fillColor: color }} />
            ))}
          </>
        ) : null}

        {usingMapbox
          ? TRAFFIC_LAYERS.map((id) => (
              <LineLayer
                key={`${id}-${theme}`}
                id={id}
                existing
                style={{ lineColor: TRAFFIC_COLOR as string }}
              />
            ))
          : null}

        {parking && carModel && walking ? (
          <ShapeSource
            id="caravana-parked-car"
            shape={{
              type: "Feature",
              properties: {},
              geometry: {
                type: "Point",
                coordinates: [parking.longitude, parking.latitude],
              },
            }}
          >
            <ModelLayer
              id="caravana-parked-car"
              style={{
                modelId: carModelId,
                modelScale: PARKED_SCALE as number[],
                modelRotation: [0, 0, 270],
                modelCastShadows: true,
                modelEmissiveStrength: 0.6,
              }}
            />
          </ShapeSource>
        ) : null}

        {simulating ? (
          <CustomLocationProvider
            coordinate={[location.longitude, location.latitude]}
            heading={location.heading ?? 0}
          />
        ) : null}

        {hasPermission && !useCarPuck ? (
          <LocationPuck
            puckBearingEnabled
            puckBearing={headingUp ? "course" : "heading"}
            pulsing={PUCK_PULSING}
          />
        ) : null}

        {/* Siempre montada (vacía sin amigos): montar y desmontar fuentes
            cambia su orden en el estilo. */}
        <MembersSource
          members={members}
          night={night}
          onPress={handleMembersPress}
        />

        {destination ? (
          <MarkerView
            coordinate={[destination.longitude, destination.latitude]}
            anchor={{ x: 0.5, y: 0.3 }}
            allowOverlap
          >
            <View style={styles.member}>
              <View style={styles.destIcon}>
                <Ionicons name="flag" size={18} color="#101603" />
              </View>
              <Text style={styles.destLabel} numberOfLines={1}>
                {destination.label}
              </Text>
            </View>
          </MarkerView>
        ) : null}

        {parking && walking ? (
          // Con el coche 3D la etiqueta flota encima de él; sin modelo (aún
          // generándose) se muestra la insignia redonda.
          <MarkerView
            coordinate={[parking.longitude, parking.latitude]}
            anchor={carModel ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.3 }}
            allowOverlap
          >
            <View
              style={[styles.member, carModel ? styles.parkedLabelWrap : null]}
            >
              {carModel ? null : (
                <View style={styles.parkingBadge}>
                  <Ionicons name="car-sport" size={20} color="#06131a" />
                </View>
              )}
              <Text style={styles.parkingLabel}>
                {parkingDistance == null || parkingDistance < 25
                  ? t('Aparcado aquí')
                  : t('Tu coche · {0}', formatDistance(parkingDistance))}
              </Text>
            </View>
          </MarkerView>
        ) : null}
      </MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: "hidden" },
  map: { flex: 1 },
  member: { alignItems: "center" },
  destIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#c9ff4d",
    borderWidth: 2,
    borderColor: "#06080b",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  destLabel: {
    marginTop: 3,
    maxWidth: 170,
    color: "#101603",
    backgroundColor: "#c9ff4d",
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: "hidden",
  },
  parkingBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FF6A33",
    borderWidth: 2,
    borderColor: "#06080b",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  parkedLabelWrap: { paddingBottom: 30 },
  parkingLabel: {
    marginTop: 3,
    color: "#FF6A33",
    backgroundColor: "#06131a",
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(77,225,255,0.5)",
    overflow: "hidden",
  },
});

// Puntos de los amigos y de la party. Componente aparte: al animar el
// deslizamiento entre posiciones solo se repinta esta fuente, no el mapa.
const MembersSource = memo(function MembersSource({
  members: incoming,
  night,
  onPress,
}: {
  members: WorldMapMember[];
  night: boolean;
  onPress: (event: { features: GeoJSON.Feature[] }) => void;
}) {
  const members = useSmoothMembers(incoming);
  const hasMembers = members.length > 0;
  const membersData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!hasMembers) return EMPTY;
    return {
      type: "FeatureCollection",
      features: members.map((member) => ({
        type: "Feature",
        id: member.id,
        properties: {
          id: member.id,
          color: member.color,
          initials: initials(member.name),
          name: member.name.split(" ")[0],
          talking: Boolean(member.isTalking),
          stale: Boolean(member.stale),
        },
        geometry: {
          type: "Point",
          coordinates: [member.longitude, member.latitude],
        },
      })),
    };
  }, [hasMembers, members]);

  return (
    <ShapeSource
      id="caravana-members"
      shape={membersData}
      cluster
      clusterRadius={44}
      clusterMaxZoomLevel={15}
      onPress={onPress}
    >
      <CircleLayer
        id="caravana-member-groups"
        filter={["has", "point_count"]}
        style={{
          circleColor: "#0b1422",
          circleOpacity: 0.92,
          circleRadius: [
            "step",
            ["to-number", ["get", "point_count"]],
            16,
            10,
            19,
            50,
            23,
            200,
            28,
          ],
          circleStrokeColor: "#ffffff",
          circleStrokeWidth: 2,
        }}
      />
      <SymbolLayer
        id="caravana-member-group-count"
        filter={["has", "point_count"]}
        style={{
          textField: [
            "concat",
            "+",
            ["to-string", ["get", "point_count_abbreviated"]],
          ],
          textFont: MEMBER_FONT,
          textSize: 13,
          textColor: "#ffffff",
          textAllowOverlap: true,
        }}
      />
      <CircleLayer
        id="caravana-member-dots"
        filter={["!", ["has", "point_count"]]}
        style={{
          circleColor: [
            "case",
            ["==", ["get", "stale"], true],
            "#5c5c66",
            ["to-color", ["get", "color"]],
          ],
          circleOpacity: ["case", ["==", ["get", "stale"], true], 0.75, 1],
          circleRadius: 14,
          circleStrokeColor: [
            "case",
            ["==", ["get", "talking"], true],
            "#ff5a1f",
            "#ffffff",
          ],
          circleStrokeWidth: [
            "case",
            ["==", ["get", "talking"], true],
            4,
            2,
          ],
        }}
      />
      <SymbolLayer
        id="caravana-member-names"
        filter={["!", ["has", "point_count"]]}
        minZoomLevel={13}
        style={{
          textField: ["to-string", ["get", "name"]],
          textFont: MEMBER_FONT,
          textSize: 12,
          textOffset: [0, 1.9],
          textAnchor: "top",
          textColor: night ? "#f3f6fa" : "#0b1422",
          textHaloColor: night ? "#0b1422" : "#ffffff",
          textHaloWidth: 1.5,
          textAllowOverlap: false,
        }}
      />
      <SymbolLayer
        id="caravana-member-labels"
        filter={["!", ["has", "point_count"]]}
        style={{
          textField: ["to-string", ["get", "initials"]],
          textFont: MEMBER_FONT,
          textSize: 11,
          textColor: "#0B0F14",
          textAllowOverlap: true,
        }}
      />
    </ShapeSource>
  );
});
