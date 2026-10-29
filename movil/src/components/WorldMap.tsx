import { memo, useCallback, useEffect, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  encodeWorldMapCommand,
  parseWorldMapEvent,
  WORLD_MAP_HTML,
  type WorldMapAlternative,
  type WorldMapCommand,
  type WorldMapDestination,
  type WorldMapLocation,
  type WorldMapMember,
  type WorldMapParking,
  type WorldMapRoute,
  type WorldMapTravelMode,
  type WorldMapVehicleKind,
} from '@/src/lib/map-html';
import { colors } from '@/src/theme';

// Valor por defecto estable: un [] nuevo en cada render reenviaría el mensaje.
const NO_ALTERNATIVES: WorldMapAlternative[] = [];

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

type WebViewHandle = { postMessage: (message: string) => void };

const MAP_SOURCE = { html: WORLD_MAP_HTML };

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
  vehicleKind = 'car',
  recenterToken = 0,
  onFollowChange,
  onMemberPress,
  onAlternativePress,
  onError,
  style,
}: WorldMapProps) {
  const webviewRef = useRef<WebViewHandle | null>(null);
  const setWebview = useCallback((node: WebViewHandle | null) => {
    webviewRef.current = node;
  }, []);
  const readyRef = useRef(false);
  const seqRef = useRef(0);
  const lastLocationKeyRef = useRef('');
  const latestRef = useRef({ members, destination, location, parking, travelMode, northUp, fitRoute, autoFollow, route, alternatives, vehicleColor, vehicleKind });
  const callbacksRef = useRef({ onFollowChange, onMemberPress, onAlternativePress, onError });

  useEffect(() => {
    latestRef.current = { members, destination, location, parking, travelMode, northUp, fitRoute, autoFollow, route, alternatives, vehicleColor, vehicleKind };
    callbacksRef.current = { onFollowChange, onMemberPress, onAlternativePress, onError };
  }, [members, destination, location, parking, travelMode, northUp, fitRoute, autoFollow, route, alternatives, vehicleColor, vehicleKind, onFollowChange, onMemberPress, onAlternativePress, onError]);

  const send = useCallback((command: WorldMapCommand) => {
    if (!readyRef.current) return;
    seqRef.current += 1;
    webviewRef.current?.postMessage(encodeWorldMapCommand(seqRef.current, command));
  }, []);

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
    send({ type: 'alternatives', payload: latest.alternatives });
    send({ type: 'vehicle', payload: { color: latest.vehicleColor, kind: latest.vehicleKind } });
  }, [send]);

  useEffect(() => {
    const key = [
      location.latitude.toFixed(5),
      location.longitude.toFixed(5),
      Math.round((location.heading ?? -1) / 5),
      Math.round((location.speedKmh ?? -1) / 2),
      Math.round((location.accuracy ?? 0) / 10),
    ].join('|');
    if (key === lastLocationKeyRef.current) return;
    lastLocationKeyRef.current = key;
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
    send({ type: 'alternatives', payload: alternatives });
  }, [alternatives, send]);

  useEffect(() => {
    send({ type: 'vehicle', payload: { color: vehicleColor, kind: vehicleKind } });
  }, [send, vehicleColor, vehicleKind]);

  useEffect(() => {
    if (recenterToken > 0) send({ type: 'recenter' });
  }, [recenterToken, send]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseWorldMapEvent(event.nativeEvent.data);
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
      if (message.type === 'alternativeTap') {
        callbacksRef.current.onAlternativePress?.(message.index);
        return;
      }
      callbacksRef.current.onError?.(message.message);
    },
    [flush],
  );

  const handleLoadStart = useCallback(() => {
    readyRef.current = false;
  }, []);

  return (
    <WebView
      ref={setWebview}
      source={MAP_SOURCE}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      scrollEnabled={false}
      bounces={false}
      setSupportMultipleWindows={false}
      allowsBackForwardNavigationGestures={false}
      androidLayerType="hardware"
      onLoadStart={handleLoadStart}
      onMessage={handleMessage}
      onError={(event) => {
        const description = event.nativeEvent.description?.trim();
        callbacksRef.current.onError?.(
          description ? `No pudimos cargar el mapa: ${description}` : 'No pudimos cargar el mapa.',
        );
      }}
      onHttpError={() => {
        callbacksRef.current.onError?.('El servidor del mapa no respondió. Revisa tu conexión.');
      }}
      style={[{ flex: 1, backgroundColor: colors.bg }, style]}
      containerStyle={{ backgroundColor: colors.bg }}
    />
  );
});
