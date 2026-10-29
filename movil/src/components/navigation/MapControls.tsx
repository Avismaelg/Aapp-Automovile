import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import type { WorldMapMode } from '@/src/lib/map-html';
import { GLASS } from '@/src/components/navigation/glass';
import { colors, spacing } from '@/src/theme';

export function MapControls({
  northUp,
  mode,
  following,
  onToggleNorth,
  onToggleMode,
  onRecenter,
}: {
  northUp: boolean;
  mode: WorldMapMode;
  following: boolean;
  onToggleNorth: () => void;
  onToggleMode: () => void;
  onRecenter: () => void;
}) {
  return (
    <View style={styles.controls}>
      <Pressable
        style={[styles.roundControl, northUp && styles.roundControlLime]}
        onPress={onToggleNorth}
        accessibilityRole="button"
        accessibilityLabel="Orientar el mapa al norte"
      >
        <AppText
          variant="label"
          color={northUp ? '#120802' : colors.text}
          style={styles.modeText}
        >
          N
        </AppText>
      </Pressable>
      <Pressable
        style={styles.roundControl}
        onPress={onToggleMode}
        accessibilityRole="button"
        accessibilityLabel={mode === '3d' ? 'Cambiar a vista 2D' : 'Cambiar a vista 3D'}
      >
        <AppText variant="label" color={colors.text} style={styles.modeText}>
          {mode === '3d' ? '3D' : '2D'}
        </AppText>
      </Pressable>
      {!following ? (
        <Pressable
          style={[styles.roundControl, styles.roundControlAccent]}
          onPress={onRecenter}
          accessibilityRole="button"
          accessibilityLabel="Recentrar mapa"
        >
          <Ionicons name="navigate" size={20} color="#120802" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  roundControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  roundControlAccent: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  roundControlLime: {
    backgroundColor: colors.lime,
    borderColor: colors.lime,
  },
  modeText: { fontSize: 11 },
});
