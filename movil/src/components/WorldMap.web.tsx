import { createElement, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import {
  buildMapHtml,
  type WorldMapDestination,
  type WorldMapLocation,
  type WorldMapMember,
  type WorldMapRoute,
} from '@/src/lib/map-html';

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
  const reactId = useId();
  const mapId = `caravana-map-${reactId.replace(/:/g, '')}`;
  const [initialLocation] = useState(location);
  const [loaded, setLoaded] = useState(false);
  const html = useMemo(
    () => buildMapHtml({ members, destination, initialLocation }),
    [members, destination, initialLocation],
  );

  const post = useCallback(
    (payload: object) => {
      const doc = (globalThis as { document?: Document }).document;
      const frame = doc?.getElementById(mapId) as HTMLIFrameElement | null;
      frame?.contentWindow?.postMessage(payload, '*');
    },
    [mapId],
  );

  useEffect(() => {
    if (!loaded) return;
    post({ type: 'location', ...location });
  }, [loaded, location, post]);

  useEffect(() => {
    if (!loaded) return;
    post({ type: 'route', route });
  }, [loaded, post, route]);

  useEffect(() => {
    if (loaded && recenterToken > 0) post({ type: 'recenter' });
  }, [loaded, post, recenterToken]);

  const resolvedStyle = StyleSheet.flatten(style) ?? {};
  const iframeStyle = {
    border: 'none',
    width: '100%',
    height: '100%',
    display: 'block',
    backgroundColor: '#080B0F',
    ...resolvedStyle,
  };

  return createElement('iframe', {
    id: mapId,
    title: 'Mapa Caravana',
    srcDoc: html,
    onLoad: () => {
      setLoaded(true);
      post({ type: 'location', ...location });
      post({ type: 'route', route });
    },
    style: iframeStyle,
    allow: 'fullscreen',
  } as never);
}
