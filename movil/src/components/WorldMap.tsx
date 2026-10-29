import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  NativeUserLocation,
  type TrackUserLocation,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useMapTheme } from '@/src/hooks/useMapTheme';
import { MAP_FALLBACK_STYLES, MAP_STYLES, WORLD_MAP_PROVIDER } from '@/src/lib/map/config';
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

// Mapa nativo (MapLibre Android/iOS): la cámara de seguimiento y el indicador
// de posición los anima el motor nativo a 60 fps, como en Waze o Google Maps.
// En web se usa WorldMap.web.tsx (MapLibre GL JS).

const NO_ALTERNATIVES: WorldMapAlternative[] = [];
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const MANEUVER_ZOOM_M = 250;

// Las capas propias van bajo la primera etiqueta que queda encima de las
// calles, para que los nombres se lean sobre la ruta. Los ids salen de los
// estilos de OpenFreeMap; con otro proveedor se pintan encima de todo.
const OPENFREEMAP_LABEL_LAYER = { day: 'waterway_line_label', night: 'place_other' };

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

function boundsOf(points: [number, number][]): [number, number, number, number] {
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
  return [west, south, east, north];
}

// El indicador nativo lee el GPS por su cuenta: solo se activa con permiso.
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
  recenterToken = 0,
  onFollowChange,
  onMemberPress,
  onAlternativePress,
  onError,
  style,
}: WorldMapProps) {
  const cameraRef = useRef<CameraRef>(null);
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
      try {
        cameraRef.current?.fitBounds(boundsOf(fitRoute), {
          padding: { top: 140, right: 48, bottom: 280, left: 48 },
          duration: 900,
          easing: 'ease',
        });
      } catch {
        // La cámara aún no existe: el encuadre se pierde, no es grave.
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [fitRoute, changeFollowing]);

  // Sin permiso de GPS (o en la demo) se centra en la posición que da la app.
  const lastCenteredRef = useRef('');
  useEffect(() => {
    if (!following || hasPermission) return;
    const key = `${location.latitude.toFixed(5)}|${location.longitude.toFixed(5)}`;
    if (key === lastCenteredRef.current) return;
    lastCenteredRef.current = key;
    try {
      cameraRef.current?.easeTo({ center: [location.longitude, location.latitude], duration: 600 });
    } catch {
      // Ídem.
    }
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

  // En navegación la flecha va abajo, para ver más calle por delante.
  const padding = useMemo(
    () => (navigating && following && !northUp ? { top: 260, right: 0, bottom: 0, left: 0 } : { top: 0, right: 0, bottom: 0, left: 0 }),
    [navigating, following, northUp],
  );

  const trackUserLocation: TrackUserLocation | undefined =
    following && hasPermission ? (northUp || walking ? 'default' : 'course') : undefined;

  const handleTrackingChange = useCallback(
    (event: { nativeEvent: { trackUserLocation: TrackUserLocation | null } }) => {
      // El motor suelta el seguimiento cuando el usuario arrastra el mapa.
      if (event.nativeEvent.trackUserLocation == null) changeFollowing(false);
    },
    [changeFollowing],
  );

  const handleAlternativePress = useCallback((event: { nativeEvent: { features: GeoJSON.Feature[] } }) => {
    const index = event.nativeEvent.features[0]?.properties?.index;
    if (typeof index === 'number') callbacksRef.current.onAlternativePress?.(index);
  }, []);

  const handleStyleError = useCallback(() => {
    setStyleFailed((failed) => {
      if (!failed) callbacksRef.current.onError?.('No pudimos cargar el mapa. Probamos con el mapa de respaldo.');
      return true;
    });
  }, []);

  const mapStyle = (styleFailed ? MAP_FALLBACK_STYLES : MAP_STYLES)[theme];
  const beforeId = styleFailed || WORLD_MAP_PROVIDER === 'openfreemap' ? OPENFREEMAP_LABEL_LAYER[theme] : undefined;
  const night = theme === 'night';

  return (
    <View style={[styles.root, { backgroundColor: night ? '#0b0f14' : '#e9edf1' }, style]}>
      <Map
        style={styles.map}
        mapStyle={mapStyle}
        touchPitch={false}
        attribution={false}
        logo={false}
        compass={false}
        scaleBar={false}
        onDidFailLoadingMap={handleStyleError}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [location.longitude, location.latitude], zoom: 15 }}
          trackUserLocation={trackUserLocation}
          onTrackUserLocationChange={handleTrackingChange}
          zoom={following ? zoom : undefined}
          bearing={following && (northUp || walking) ? 0 : undefined}
          pitch={0}
          padding={padding}
          duration={800}
          easing="ease"
        />

        <GeoJSONSource key={`alt-${theme}`} id="caravana-alternatives" data={alternativesData} onPress={handleAlternativePress}>
          <Layer
            id="caravana-alt-casing"
            type="line"
            beforeId={beforeId}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#6f7f93',
              'line-width': ['interpolate', ['linear'], ['zoom'], 11, 6, 14, 9, 16, 13, 18, 19],
            }}
          />
          <Layer
            id="caravana-alt-line"
            type="line"
            beforeId={beforeId}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#b4c2d3',
              'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 14, 6, 16, 9, 18, 14],
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource key={`route-${theme}`} id="caravana-route" data={routeData}>
          <Layer
            id="caravana-route-casing"
            type="line"
            beforeId={beforeId}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['case', ['==', ['get', 'segment'], 'past'], '#8a96a4', '#1458b8'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 11, 8, 14, 12, 16, 17, 18, 24],
              'line-opacity': ['case', ['==', ['get', 'segment'], 'past'], 0.6, 1],
            }}
          />
          <Layer
            id="caravana-route-line"
            type="line"
            beforeId={beforeId}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['case', ['==', ['get', 'segment'], 'past'], '#c3cbd4', '#3d9bff'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5.5, 14, 8.5, 16, 12.5, 18, 18],
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource key={`maneuver-${theme}`} id="caravana-maneuver" data={maneuverData}>
          <Layer
            id="caravana-maneuver"
            type="circle"
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 8],
              'circle-color': '#ffffff',
              'circle-stroke-color': '#1458b8',
              'circle-stroke-width': 3,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource key={`parking-${theme}`} id="caravana-parking-line" data={parkingLineData}>
          <Layer
            id="caravana-parking-line"
            type="line"
            beforeId={beforeId}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#4de1ff', 'line-width': 4, 'line-dasharray': [2, 2], 'line-opacity': 0.9 }}
          />
        </GeoJSONSource>

        {hasPermission ? (
          <NativeUserLocation mode={walking || northUp ? 'heading' : 'course'} androidPreferredFramesPerSecond={60} />
        ) : null}

        {members.map((member) => (
          <Marker
            key={member.id}
            id={`member-${member.id}`}
            lngLat={[member.longitude, member.latitude]}
            anchor="top"
            offset={[0, -22]}
            onPress={() => callbacksRef.current.onMemberPress?.(member.id)}
          >
            <View style={styles.member}>
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
            </View>
          </Marker>
        ))}

        {destination ? (
          <Marker id="destination" lngLat={[destination.longitude, destination.latitude]} anchor="top" offset={[0, -20]}>
            <View style={styles.member}>
              <View style={styles.destIcon}>
                <Ionicons name="flag" size={18} color="#101603" />
              </View>
              <Text style={styles.destLabel} numberOfLines={1}>
                {destination.label}
              </Text>
            </View>
          </Marker>
        ) : null}

        {parking ? (
          <Marker id="parking" lngLat={[parking.longitude, parking.latitude]} anchor="top" offset={[0, -19]}>
            <View style={styles.member}>
              <View style={styles.parkingBadge}>
                <Ionicons name="car-sport" size={20} color="#06131a" />
              </View>
              <Text style={styles.parkingLabel}>
                {parkingDistance == null || parkingDistance < 25
                  ? 'Tu coche'
                  : parkingDistance < 1000
                    ? `Tu coche · ${parkingDistance} m`
                    : `Tu coche · ${(parkingDistance / 1000).toFixed(1).replace('.', ',')} km`}
              </Text>
            </View>
          </Marker>
        ) : null}
      </Map>
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
