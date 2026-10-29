import { Ionicons } from '@expo/vector-icons';
import Mapbox, {
  Camera,
  CircleLayer,
  CustomLocationProvider,
  LineLayer,
  LocationPuck,
  MapView,
  MarkerView,
  ModelLayer,
  ShapeSource,
  UserTrackingMode,
} from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, findNodeHandle, Platform, Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { addModel, resetPuck, setModelPuck } from '@/modules/car-puck';

import { useCarModel } from '@/src/hooks/useCarModel';
import { useMapTheme } from '@/src/hooks/useMapTheme';
import { useSimulator } from '@/src/lib/simulator';
import {
  MAP_FALLBACK_STYLES,
  MAPBOX_ACCESS_TOKEN,
  NATIVE_LABEL_LAYER,
  NATIVE_MAP_STYLES,
} from '@/src/lib/map/config';
import type {
  WorldMapAlternative,
  WorldMapDestination,
  WorldMapLocation,
  WorldMapMember,
  WorldMapParking,
  WorldMapRoute,
  WorldMapTravelMode,
  WorldMapVehicleKind,
} from '@/src/lib/map-html';
import { cumulativeDistances, metersBetween, nextInstruction, routeProgress } from '@/src/lib/route-instructions';
import { colors } from '@/src/theme';

// Mapa nativo (Mapbox Maps SDK v11 vía @rnmapbox/maps): la cámara de
// seguimiento y el indicador de posición los anima el motor nativo a 60 fps.
// En web se usa WorldMap.web.tsx (MapLibre GL JS).
Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN || null);

const NO_ALTERNATIVES: WorldMapAlternative[] = [];
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const MANEUVER_ZOOM_M = 250;
const OPENFREEMAP_LABEL_LAYER = { day: 'waterway_line_label', night: 'place_other' };
// Halo del punto azul (a pie o sin coche 3D).
const PUCK_PULSING = { isEnabled: true, color: '#3d9bff', radius: 'accuracy' } as const;
const NO_PADDING = { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 };
// En navegación la flecha va abajo, para ver más calle por delante.
const NAV_PADDING = { paddingTop: 260, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 };
// Capas de tráfico del estilo de navegación de Mapbox. Por defecto pintan de
// verde las calles sin atasco; aquí solo se colorean las retenciones, como
// en Google Maps.
const TRAFFIC_LAYERS = [
  'traffic-tunnel-link-navigation',
  'traffic-tunnel-minor-navigation',
  'traffic-tunnel-street-navigation',
  'traffic-tunnel-secondary-tertiary-navigation',
  'traffic-tunnel-primary-navigation',
  'traffic-tunnel-major-link-navigation',
  'traffic-tunnel-motorway-trunk-navigation',
  'traffic-bridge-road-link-navigation',
  'traffic-bridge-road-minor-navigation',
  'traffic-bridge-road-street-navigation',
  'traffic-bridge-road-secondary-tertiary-navigation',
  'traffic-bridge-road-primary-navigation',
  'traffic-bridge-road-major-link-navigation',
  'traffic-bridge-road-motorway-trunk-navigation',
];
const TRAFFIC_COLOR: unknown = [
  'match', ['get', 'congestion'],
  'moderate', '#f59e0b',
  'heavy', '#ef4444',
  'severe', '#991b1b',
  'rgba(0,0,0,0)',
];

// Coche 3D como indicador de posición (Android): tamaño fijo en pantalla
// (~45 pt de largo) y giro para que el morro apunte hacia la marcha.
const PUCK_SCALE = 11;
const PUCK_ROTATION = 270;
// El coche aparcado está en el mapa (metros): para que mida ~45 pt a
// cualquier zoom, la escala se duplica por cada nivel que te alejas. Va por
// escalones de medio nivel porque Mapbox no interpola listas.
const PARKED_SCALE: unknown = [
  'step', ['zoom'],
  ['literal', [184.0, 184.0, 184.0]],
  12.5, ['literal', [130.11, 130.11, 130.11]],
  13, ['literal', [92.0, 92.0, 92.0]],
  13.5, ['literal', [65.05, 65.05, 65.05]],
  14, ['literal', [46.0, 46.0, 46.0]],
  14.5, ['literal', [32.53, 32.53, 32.53]],
  15, ['literal', [23.0, 23.0, 23.0]],
  15.5, ['literal', [16.26, 16.26, 16.26]],
  16, ['literal', [11.5, 11.5, 11.5]],
  16.5, ['literal', [8.13, 8.13, 8.13]],
  17, ['literal', [5.75, 5.75, 5.75]],
  17.5, ['literal', [4.07, 4.07, 4.07]],
  18, ['literal', [2.88, 2.88, 2.88]],
  18.5, ['literal', [2.03, 2.03, 2.03]],
  19, ['literal', [1.44, 1.44, 1.44]],
  19.5, ['literal', [1.02, 1.02, 1.02]],
  20, ['literal', [0.72, 0.72, 0.72]],
];

type WorldMapProps = {
  members: WorldMapMember[];
  destination?: WorldMapDestination | null;
  location: WorldMapLocation;
  parking?: WorldMapParking | null;
  travelMode?: WorldMapTravelMode;
  northUp?: boolean;
  fitRoute?: [number, number][] | null;
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
  onFollowChange?: (following: boolean) => void;
  onMemberPress?: (memberId: string) => void;
  onAlternativePress?: (index: number) => void;
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

// Zoom según la velocidad: cerca en ciudad, más abierto en autopista y más
// cerca aún al acercarse a una maniobra.
function zoomForSpeed(speedKmh: number, walking: boolean, nearManeuver: boolean) {
  if (walking) return 17.5;
  let zoom = 15.3;
  if (speedKmh < 25) zoom = 17;
  else if (speedKmh < 50) zoom = 16.5;
  else if (speedKmh < 80) zoom = 16;
  if (nearManeuver && speedKmh < 80) zoom = Math.max(zoom, 17);
  return zoom;
}

function toLngLat(point: [number, number]): [number, number] {
  return [point[1], point[0]];
}

function line(coordinates: [number, number][], properties: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: coordinates.map(toLngLat) },
  };
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
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
    let active = true;
    const check = () =>
      Location.getForegroundPermissionsAsync()
        .then((result) => {
          if (active) setGranted(result.granted);
        })
        .catch(() => {});
    void check();
    const timer = setInterval(() => {
      if (!granted) void check();
    }, 5_000);
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
  travelMode = 'car',
  northUp = false,
  fitRoute = null,
  autoFollow = true,
  route = null,
  alternatives = NO_ALTERNATIVES,
  vehicleColor = '#ff5a1f',
  recenterToken = 0,
  ornamentBottom = 4,
  drivingLine = null,
  focus = null,
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
  const carModelId = `caravana-${(carModel ?? 'car').split('/').pop()}`;
  const simulating = useSimulator((state) => state.active);
  const theme = useMapTheme(location);
  const hasPermission = useLocationPermission();
  const [styleFailed, setStyleFailed] = useState(false);
  const [userFollowing, setFollowing] = useState(autoFollow);
  const callbacksRef = useRef({ onFollowChange, onMemberPress, onAlternativePress, onError });
  const walking = travelMode === 'walking';
  const following = autoFollow && userFollowing;

  useEffect(() => {
    callbacksRef.current = { onFollowChange, onMemberPress, onAlternativePress, onError };
  }, [onFollowChange, onMemberPress, onAlternativePress, onError]);

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
      cameraRef.current?.fitBounds(ne, sw, [140, 48, 280, 48], 900);
    }, 50);
    return () => clearTimeout(timer);
  }, [fitRoute, changeFollowing]);

  useEffect(() => {
    if (!focus) return;
    changeFollowing(false);
    cameraRef.current?.setCamera({
      centerCoordinate: [focus.longitude, focus.latitude],
      zoomLevel: 17.5,
      heading: 0,
      animationMode: 'flyTo',
      animationDuration: 1200,
    });
    // Solo al pedirlo (token), no cuando cambian las coordenadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token, changeFollowing]);

  // Sin permiso de GPS (o en la demo) se centra en la posición que da la app.
  const lastCenteredRef = useRef('');
  useEffect(() => {
    if (!following || hasPermission) return;
    const key = `${location.latitude.toFixed(5)}|${location.longitude.toFixed(5)}`;
    if (key === lastCenteredRef.current) return;
    lastCenteredRef.current = key;
    cameraRef.current?.setCamera({
      centerCoordinate: [location.longitude, location.latitude],
      animationMode: 'easeTo',
      animationDuration: 600,
    });
  }, [following, hasPermission, location.latitude, location.longitude]);

  const cumulative = useMemo(
    () => (route && route.coordinates.length >= 2 ? cumulativeDistances(route.coordinates) : null),
    [route],
  );
  const progress = useMemo(
    () => (route && cumulative ? routeProgress(route.coordinates, cumulative, location) : null),
    [route, cumulative, location],
  );
  const nearestIndex = progress?.nearestIndex ?? 0;

  // Lo recorrido en gris y lo que falta en azul; solo cambia al avanzar de punto.
  const routeData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!route || route.coordinates.length < 2) return EMPTY;
    const features: GeoJSON.Feature[] = [];
    if (nearestIndex > 0) features.push(line(route.coordinates.slice(0, nearestIndex + 1), { segment: 'past' }));
    const ahead = route.coordinates.slice(nearestIndex);
    if (ahead.length >= 2) features.push(line(ahead, { segment: 'ahead' }));
    return { type: 'FeatureCollection', features };
  }, [route, nearestIndex]);

  const alternativesData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: alternatives
        .filter((item) => item.coordinates.length >= 2)
        .map((item) => line(item.coordinates, { index: item.index })),
    }),
    [alternatives],
  );

  // Punto de la próxima maniobra (un círculo blanco sobre la ruta).
  const upcoming = useMemo(
    () => (route && progress ? nextInstruction(route.instructions, progress.progressM) : null),
    [route, progress],
  );
  const maneuverData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!route || !cumulative || !upcoming) return EMPTY;
    if (upcoming.icon === 'depart' || upcoming.icon === 'straight') return EMPTY;
    const index = cumulative.findIndex((value) => value >= upcoming.atDistanceM);
    const point = route.coordinates[index < 0 ? route.coordinates.length - 1 : index];
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: toLngLat(point) } }],
    };
  }, [route, cumulative, upcoming]);

  const parkingDistance = parking ? Math.round(metersBetween(location, parking)) : null;
  const parkingKey = parking && parkingDistance != null && parkingDistance > 40
    ? `${parking.latitude}|${parking.longitude}|${Math.round(location.latitude * 5000)}|${Math.round(location.longitude * 5000)}`
    : '';
  const parkingLineData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!parkingKey || !parking) return EMPTY;
    return {
      type: 'FeatureCollection',
      features: [line([[location.latitude, location.longitude], [parking.latitude, parking.longitude]])],
    };
    // La línea se rehace al moverse ~20 m (parkingKey), no con cada señal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkingKey]);

  const speedKmh = location.speedKmh ?? 0;
  const nearManeuver = upcoming != null && upcoming.remainingM < MANEUVER_ZOOM_M;
  const zoom = zoomForSpeed(speedKmh, walking, nearManeuver);
  const navigating = Boolean(route) && !walking;
  const headingUp = !northUp && !walking;
  const tracking = following && hasPermission;

  // Cambia el punto azul por el coche 3D. Mapbox recrea su indicador al
  // cargar un estilo, así que se vuelve a aplicar en cada carga.
  const [styleLoads, setStyleLoads] = useState(0);
  const useCarPuck = Platform.OS === 'android' && !walking && hasPermission && carModel != null;
  // Si el coche 3D no se pudo poner se reintenta cada 3 s y al volver la app
  // a primer plano (en segundo plano el mapa no está en pantalla y falla).
  // No se monta el punto de rnmapbox como respaldo: al desmontarse apaga el
  // indicador nativo entero, coche incluido.
  const [retryTick, setRetryTick] = useState(0);
  const puckIsModelRef = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setRetryTick((tick) => tick + 1);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android' || !carModel || styleLoads === 0) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      const tag = findNodeHandle(mapRef.current);
      if (tag == null) return;
      // El modelo del coche aparcado se registra en cada estilo cargado.
      void addModel(tag, carModelId, carModel);
      if (useCarPuck) {
        void setModelPuck(tag, carModel, PUCK_SCALE, PUCK_ROTATION).then((applied) => {
          puckIsModelRef.current = applied;
          if (!applied) retry = setTimeout(() => setRetryTick((tick) => tick + 1), 3_000);
        });
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
  const handleStyleLoaded = useCallback(() => setStyleLoads((count) => count + 1), []);

  const handleTrackingChange = useCallback(
    (event: { nativeEvent: { payload: { followUserLocation: boolean } } }) => {
      // El motor suelta el seguimiento cuando el usuario arrastra el mapa.
      if (!event.nativeEvent.payload.followUserLocation) changeFollowing(false);
    },
    [changeFollowing],
  );

  const handleAlternativePress = useCallback((event: { features: GeoJSON.Feature[] }) => {
    const index = event.features[0]?.properties?.index;
    if (typeof index === 'number') callbacksRef.current.onAlternativePress?.(index);
  }, []);

  const handleStyleError = useCallback(() => {
    setStyleFailed((failed) => {
      if (!failed) callbacksRef.current.onError?.('No pudimos cargar el mapa. Probamos con el mapa de respaldo.');
      return true;
    });
  }, []);

  const usingMapbox = Boolean(MAPBOX_ACCESS_TOKEN) && !styleFailed;
  const styleURL = (styleFailed ? MAP_FALLBACK_STYLES : NATIVE_MAP_STYLES)[theme];
  const belowLayerID = (styleFailed ? OPENFREEMAP_LABEL_LAYER : NATIVE_LABEL_LAYER)[theme];
  const night = theme === 'night';

  return (
    <View style={[styles.root, { backgroundColor: night ? '#0b0f14' : '#e9edf1' }, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        styleURL={styleURL}
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
          defaultSettings={{ centerCoordinate: [location.longitude, location.latitude], zoomLevel: 15 }}
          followUserLocation={tracking}
          followUserMode={headingUp ? UserTrackingMode.FollowWithCourse : UserTrackingMode.Follow}
          followZoomLevel={zoom}
          followPitch={0}
          followHeading={headingUp ? undefined : 0}
          followPadding={navigating && headingUp ? NAV_PADDING : NO_PADDING}
          onUserTrackingModeChange={handleTrackingChange}
        />

        <ShapeSource id="caravana-alternatives" shape={alternativesData} onPress={handleAlternativePress}>
          <LineLayer
            id="caravana-alt-casing"
            belowLayerID={belowLayerID}
            style={{
              lineCap: 'round',
              lineJoin: 'round',
              lineColor: '#6f7f93',
              lineWidth: ['interpolate', ['linear'], ['zoom'], 11, 6, 14, 9, 16, 13, 18, 19],
            }}
          />
          <LineLayer
            id="caravana-alt-line"
            belowLayerID={belowLayerID}
            style={{
              lineCap: 'round',
              lineJoin: 'round',
              lineColor: '#b4c2d3',
              lineWidth: ['interpolate', ['linear'], ['zoom'], 11, 4, 14, 6, 16, 9, 18, 14],
            }}
          />
        </ShapeSource>

        <ShapeSource id="caravana-route" shape={routeData}>
          <LineLayer
            id="caravana-route-casing"
            belowLayerID={belowLayerID}
            style={{
              lineCap: 'round',
              lineJoin: 'round',
              lineColor: ['case', ['==', ['get', 'segment'], 'past'], '#8a96a4', '#1458b8'],
              lineWidth: ['interpolate', ['linear'], ['zoom'], 11, 8, 14, 12, 16, 17, 18, 24],
              lineOpacity: ['case', ['==', ['get', 'segment'], 'past'], 0.6, 1],
            }}
          />
          <LineLayer
            id="caravana-route-line"
            belowLayerID={belowLayerID}
            style={{
              lineCap: 'round',
              lineJoin: 'round',
              lineColor: ['case', ['==', ['get', 'segment'], 'past'], '#c3cbd4', '#3d9bff'],
              lineWidth: ['interpolate', ['linear'], ['zoom'], 11, 5.5, 14, 8.5, 16, 12.5, 18, 18],
            }}
          />
        </ShapeSource>

        {/* Línea de conducción encima de la ruta: trazos azul, amarillo y rojo. */}
        <ShapeSource id="caravana-driving-line" shape={drivingLine ?? EMPTY}>
          <LineLayer
            id="caravana-driving-line"
            belowLayerID={belowLayerID}
            style={{
              lineCap: 'butt',
              lineJoin: 'round',
              lineColor: ['match', ['get', 'level'], 'brake', '#ef4444', 'ease', '#facc15', '#38bdf8'],
              lineWidth: ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 9, 18, 14],
              lineDasharray: [1.4, 0.9],
              lineOpacity: 0.95,
            }}
          />
        </ShapeSource>

        <ShapeSource id="caravana-maneuver" shape={maneuverData}>
          <CircleLayer
            id="caravana-maneuver"
            style={{
              circleRadius: ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 8],
              circleColor: '#ffffff',
              circleStrokeColor: '#1458b8',
              circleStrokeWidth: 3,
            }}
          />
        </ShapeSource>

        <ShapeSource id="caravana-parking-line" shape={parkingLineData}>
          <LineLayer
            id="caravana-parking-line"
            belowLayerID={belowLayerID}
            style={{
              lineCap: 'round',
              lineJoin: 'round',
              lineColor: '#4de1ff',
              lineWidth: 4,
              lineDasharray: [2, 2],
              lineOpacity: 0.9,
            }}
          />
        </ShapeSource>

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
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [parking.longitude, parking.latitude] },
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
          <LocationPuck puckBearingEnabled puckBearing={headingUp ? 'course' : 'heading'} pulsing={PUCK_PULSING} />
        ) : null}

        {members.map((member) => (
          <MarkerView
            key={member.id}
            coordinate={[member.longitude, member.latitude]}
            anchor={{ x: 0.5, y: 0.25 }}
            allowOverlap
          >
            <Pressable style={styles.member} onPress={() => callbacksRef.current.onMemberPress?.(member.id)}>
              <View
                style={[
                  styles.memberDot,
                  { backgroundColor: member.color },
                  member.isTalking ? styles.memberTalking : null,
                ]}
              >
                <Text style={styles.memberInitials}>{initials(member.name)}</Text>
              </View>
              <Text style={[styles.memberName, night ? styles.memberNameNight : null]} numberOfLines={1}>
                {member.name.split(' ')[0]}
              </Text>
            </Pressable>
          </MarkerView>
        ))}

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
            <View style={[styles.member, carModel ? styles.parkedLabelWrap : null]}>
              {carModel ? null : (
                <View style={styles.parkingBadge}>
                  <Ionicons name="car-sport" size={20} color="#06131a" />
                </View>
              )}
              <Text style={styles.parkingLabel}>
                {parkingDistance == null || parkingDistance < 25
                  ? 'Aparcado aquí'
                  : parkingDistance < 1000
                    ? `Tu coche · ${parkingDistance} m`
                    : `Tu coche · ${(parkingDistance / 1000).toFixed(1).replace('.', ',')} km`}
              </Text>
            </View>
          </MarkerView>
        ) : null}
      </MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  map: { flex: 1 },
  member: { alignItems: 'center' },
  memberDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(6,8,11,0.9)',
    elevation: 4,
  },
  memberTalking: { borderColor: '#ff5a1f', borderWidth: 3 },
  memberInitials: { color: '#071016', fontWeight: '800', fontSize: 12 },
  memberName: {
    marginTop: 3,
    maxWidth: 120,
    color: '#1b2430',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  memberNameNight: { color: '#e8edf4', backgroundColor: 'rgba(6,8,11,0.85)' },
  destIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#c9ff4d',
    borderWidth: 2,
    borderColor: '#06080b',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  destLabel: {
    marginTop: 3,
    maxWidth: 170,
    color: '#101603',
    backgroundColor: '#c9ff4d',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  parkingBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#4de1ff',
    borderWidth: 2,
    borderColor: '#06080b',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  parkedLabelWrap: { paddingBottom: 30 },
  parkingLabel: {
    marginTop: 3,
    color: '#4de1ff',
    backgroundColor: '#06131a',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(77,225,255,0.5)',
    overflow: 'hidden',
  },
});
