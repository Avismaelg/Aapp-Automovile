import { Linking, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/src/components/ui';
import { WORLD_MAP_PROVIDER } from '@/src/lib/map-html';
import { colors } from '@/src/theme';

const ATTRIBUTION =
  WORLD_MAP_PROVIDER === 'maptiler'
    ? '© MapTiler · © OpenStreetMap'
    : '© OpenFreeMap · © OpenMapTiles · © OpenStreetMap';

// Atribución obligatoria de las teselas, según el proveedor configurado.
export function MapAttribution({ style }: { style?: StyleProp<ViewStyle> }) {
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
