import { Linking, Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/src/components/ui';
import { MAPBOX_ACCESS_TOKEN } from '@/src/lib/map/config';
import { WORLD_MAP_PROVIDER } from '@/src/lib/map-html';
import { colors } from '@/src/theme';

const ATTRIBUTION =
  WORLD_MAP_PROVIDER === 'maptiler'
    ? '© MapTiler · © OpenStreetMap'
    : '© OpenFreeMap · © OpenMapTiles · © OpenStreetMap';

// Atribución obligatoria de las teselas, según el proveedor configurado.
// En el móvil con Mapbox la atribución la pone el propio SDK (logo e «i»).
export function MapAttribution({ style }: { style?: StyleProp<ViewStyle> }) {
  if (Platform.OS !== 'web' && MAPBOX_ACCESS_TOKEN) return null;
  return (
    <Pressable
      style={style}
      hitSlop={6}
      onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
      accessibilityRole="link"
    >
      <AppText variant="caption" color={colors.dim} style={{ fontSize: 9 }}>
        {ATTRIBUTION}
      </AppText>
    </Pressable>
  );
}
