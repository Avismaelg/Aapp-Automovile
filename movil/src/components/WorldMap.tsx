import { useCallback, useEffect, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

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
  type WorldMapVehicleKind,
} from '@/src/lib/map-html';
import { colors } from '@/src/theme';

type WorldMapProps = {
  members: WorldMapMember[];
  destination?: WorldMapDestination | null;
  location: WorldMapLocation;
  parking?: WorldMapParking | null;
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

type WebViewHandle = { postMessage: (message: string) => void };

const MAP_SOURCE = { html: WORLD_MAP_HTML };

export function WorldMap({
  members,
  destination = null,
  location,
  parking = null,
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
  const webviewRef = useRef<WebViewHandle | null>(null);
  const setWebview = useCallback((node: WebViewHandle | null) => {
    webviewRef.current = node;
  }, []);
  const readyRef = useRef(false);
  const seqRef = useRef(0);
  const latestRef = useRef({ members, destination, location, parking, route, mode, vehicleColor, vehicleKind });
  const callbacksRef = useRef({ onFollowChange, onMemberPress, onError });

  useEffect(() => {
    latestRef.current = { members, destination, location, parking, route, mode, vehicleColor, vehicleKind };
    callbacksRef.current = { onFollowChange, onMemberPress, onError };
  }, [members, destination, location, parking, route, mode, vehicleColor, vehicleKind, onFollowChange, onMemberPress, onError]);

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
      style={[{ flex: 1, backgroundColor: colors.bg }, style]}
      containerStyle={{ backgroundColor: colors.bg }}
    />
  );
}
