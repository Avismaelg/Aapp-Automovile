import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import {
  buildMapHtml,
  type WorldMapDestination,
  type WorldMapLocation,
  type WorldMapMember,
  type WorldMapRoute,
} from '@/src/lib/map-html';
import { colors } from '@/src/theme';

type WorldMapProps = {
  members: WorldMapMember[];
  destination?: WorldMapDestination | null;
  location: WorldMapLocation;
  route?: WorldMapRoute | null;
  recenterToken?: number;
  style?: StyleProp<ViewStyle>;
};

export function WorldMap({
  members,
  destination,
  location,
  route,
  recenterToken = 0,
  style,
}: WorldMapProps) {
  const webviewRef = useRef<any>(null);
  const locationRef = useRef(location);
  const routeRef = useRef(route);
  const [initialLocation] = useState(location);
  const html = useMemo(
    () => buildMapHtml({ members, destination, initialLocation }),
    [members, destination, initialLocation],
  );

  const post = useCallback((payload: object) => {
    webviewRef.current?.postMessage(JSON.stringify(payload));
  }, []);

  const sendLocation = useCallback(() => {
    post({ type: 'location', ...locationRef.current });
  }, [post]);

  const sendRoute = useCallback(() => {
    post({ type: 'route', route: routeRef.current });
  }, [post]);

  useEffect(() => {
    locationRef.current = location;
    post({ type: 'location', ...location });
  }, [location, post]);

  useEffect(() => {
    routeRef.current = route;
    post({ type: 'route', route });
  }, [post, route]);

  useEffect(() => {
    if (recenterToken > 0) post({ type: 'recenter' });
  }, [post, recenterToken]);

  return (
    <WebView
      ref={webviewRef}
      source={{ html }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      scrollEnabled={false}
      setSupportMultipleWindows={false}
      allowsBackForwardNavigationGestures={false}
      onLoadEnd={() => {
        sendLocation();
        sendRoute();
      }}
      style={[{ flex: 1, backgroundColor: colors.bg }, style]}
      containerStyle={{ backgroundColor: colors.bg }}
    />
  );
}
