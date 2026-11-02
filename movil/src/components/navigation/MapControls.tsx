import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
import { colors, spacing } from '@/src/theme';

export function MapControls({
  northUp,
  following,
  onToggleNorth,
  onRecenter,
}: {
  northUp: boolean;
  following: boolean;
  onToggleNorth: () => void;
  onRecenter: () => void;
}) {
  const chrome = useMapChrome();
  return (
    <View style={styles.controls}>
      <Pressable
        style={[styles.roundControl, chrome.surface, northUp && styles.active]}
        onPress={onToggleNorth}
        accessibilityRole="button"
        accessibilityLabel="Orientar el mapa al norte"
      >
        <Ionicons name="compass-outline" size={20} color={northUp ? chrome.onAccent : chrome.text} />
        <AppText variant="label" color={northUp ? chrome.onAccent : chrome.muted} style={styles.modeText}>
          N
        </AppText>
      </Pressable>
      {!following ? (
        <Pressable
          style={[styles.recenter, chrome.surface]}
          onPress={onRecenter}
          accessibilityRole="button"
          accessibilityLabel="Recentrar mapa"
        >
          <Ionicons name="navigate" size={18} color={chrome.accent} />
          <AppText variant="bodyStrong" color={chrome.text} style={styles.recenterText}>
            Centrar
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  roundControl: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeText: { fontSize: 8, marginTop: -2 },
  recenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
  },
  recenterText: { fontSize: 14 },
});
