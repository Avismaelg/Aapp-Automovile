import { createElement, useCallback, useEffect, useId, useRef } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import {
  encodeWorldMapCommand,
  parseWorldMapEvent,
  WORLD_MAP_HTML,
  type WorldMapCommand,
  type WorldMapDestination,
  type WorldMapLocation,
  type WorldMapMember,
  type WorldMapMode,
  type WorldMapParking,
  type WorldMapRoute,
  type WorldMapTravelMode,
  type WorldMapVehicleKind,
} from '@/src/lib/map-html';
import { colors } from '@/src/theme';

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
  mode?: WorldMapMode;
  vehicleColor?: string;
  vehicleKind?: WorldMapVehicleKind;
  recenterToken?: number;
  onFollowChange?: (following: boolean) => void;
  onMemberPress?: (memberId: string) => void;
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function WorldMap({
  members,
  destination = null,
  location,
  parking = null,
  travelMode = 'car',
  northUp = false,
  fitRoute = null,
  autoFollow = true,
  route = null,
  mode = '3d',
  vehicleColor = '#ff5a1f',
  vehicleKind = 'car',
  recenterToken = 0,
  onFollowChange,
  onMemberPress,
  onError,
  style,
}: WorldMapProps) {
  const reactId = useId();
  const frameId = `caravana-map-${reactId.replace(/:/g, '')}`;
  const readyRef = useRef(false);
  const seqRef = useRef(0);
  const latestRef = useRef({ members, destination, location, parking, travelMode, northUp, fitRoute, autoFollow, route, mode, vehicleColor, vehicleKind });
  const callbacksRef = useRef({ onFollowChange, onMemberPress, onError });

  useEffect(() => {
    latestRef.current = { members, destination, location, parking, travelMode, northUp, fitRoute, autoFollow, route, mode, vehicleColor, vehicleKind };
    callbacksRef.current = { onFollowChange, onMemberPress, onError };
  }, [members, destination, location, parking, travelMode, northUp, fitRoute, autoFollow, route, mode, vehicleColor, vehicleKind, onFollowChange, onMemberPress, onError]);

  const getContentWindow = useCallback(() => {
    const doc = (globalThis as { document?: Document }).document;
    const frame = doc?.getElementById(frameId) as HTMLIFrameElement | null | undefined;
    return frame?.contentWindow ?? null;
  }, [frameId]);

  const send = useCallback(
    (command: WorldMapCommand) => {
      if (!readyRef.current) return;
      seqRef.current += 1;
      getContentWindow()?.postMessage(encodeWorldMapCommand(seqRef.current, command), '*');
    },
    [getContentWindow],
  );

  const flush = useCallback(() => {
    const latest = latestRef.current;
    send({ type: 'location', payload: latest.location });
    send({ type: 'members', payload: latest.members });
    send({ type: 'destination', payload: latest.destination });
    send({ type: 'parking', payload: latest.parking });
    send({ type: 'travel', payload: latest.travelMode });
    send({ type: 'north', payload: latest.northUp });
    send({ type: 'autofollow', payload: latest.autoFollow });
    if (latest.fitRoute) send({ type: 'fit', payload: { coordinates: latest.fitRoute } });
    send({ type: 'route', payload: latest.route });
    send({ type: 'mode', payload: latest.mode });
    send({ type: 'vehicle', payload: { color: latest.vehicleColor, kind: latest.vehicleKind } });
  }, [send]);

  useEffect(() => {
    send({ type: 'location', payload: location });
  }, [location, send]);

  useEffect(() => {
    send({ type: 'members', payload: members });
  }, [members, send]);

  useEffect(() => {
    send({ type: 'destination', payload: destination });
  }, [destination, send]);

  useEffect(() => {
    send({ type: 'parking', payload: parking });
  }, [parking, send]);

  useEffect(() => {
    send({ type: 'travel', payload: travelMode });
  }, [travelMode, send]);

  useEffect(() => {
    send({ type: 'north', payload: northUp });
  }, [northUp, send]);

  useEffect(() => {
    send({ type: 'autofollow', payload: autoFollow });
  }, [autoFollow, send]);

  useEffect(() => {
    if (fitRoute && fitRoute.length >= 2) {
      send({ type: 'fit', payload: { coordinates: fitRoute } });
    }
  }, [fitRoute, send]);

  useEffect(() => {
    send({ type: 'route', payload: route });
  }, [route, send]);

  useEffect(() => {
    send({ type: 'mode', payload: mode });
  }, [mode, send]);

  useEffect(() => {
    send({ type: 'vehicle', payload: { color: vehicleColor, kind: vehicleKind } });
  }, [send, vehicleColor, vehicleKind]);

  useEffect(() => {
    if (recenterToken > 0) send({ type: 'recenter' });
  }, [recenterToken, send]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const contentWindow = getContentWindow();
      if (!contentWindow || event.source !== contentWindow) return;

      const message = parseWorldMapEvent(event.data);
      if (!message) return;

      if (message.type === 'ready') {
        readyRef.current = true;
        flush();
        return;
      }
      if (message.type === 'follow') {
        callbacksRef.current.onFollowChange?.(message.value);
        return;
      }
      if (message.type === 'memberTap') {
        callbacksRef.current.onMemberPress?.(message.id);
        return;
      }
      callbacksRef.current.onError?.(message.message);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [flush, getContentWindow]);

  const resolvedStyle = StyleSheet.flatten(style) ?? {};

  return createElement('iframe', {
    id: frameId,
    title: 'Mapa Caravana',
    srcDoc: WORLD_MAP_HTML,
    allow: 'fullscreen',
    style: {
      border: 'none',
      width: '100%',
      height: '100%',
      display: 'block',
      backgroundColor: colors.bg,
      ...resolvedStyle,
    },
  } as never);
}
