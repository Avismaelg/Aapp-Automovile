import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { useMapChrome } from '@/src/components/navigation/glass';
import { colors, radius } from '@/src/theme';

// Velocímetro compacto: burbuja con la velocidad, señal de límite al lado y,
// si se conoce, la calle actual.
export function SpeedHud({
  speedLabel,
  limitKmh,
  isLive,
  street,
}: {
  speedLabel: string;
  limitKmh: number | null;
  isLive: boolean;
  street: string | null;
}) {
  const chrome = useMapChrome();
  const speed = Number(speedLabel);
  const over = limitKmh != null && Number.isFinite(speed) && speed > limitKmh + 5;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.bubble, chrome.surface, over && styles.bubbleOver]}>
          <AppText variant="display" color={over ? '#ffffff' : chrome.text} style={styles.value}>
            {speedLabel}
          </AppText>
          <View style={styles.unitRow}>
            <View style={[styles.liveDot, !isLive && styles.liveDotOff]} />
            <AppText variant="label" color={over ? '#ffe4e6' : chrome.muted} style={styles.unit}>
              {isLive ? 'km/h' : 'demo'}
            </AppText>
          </View>
        </View>
        {limitKmh != null ? (
          <View style={styles.limit}>
            <AppText variant="label" style={styles.limitText}>
              {limitKmh}
            </AppText>
          </View>
        ) : null}
      </View>
      {street ? (
        <View style={[styles.street, chrome.surface]}>
          <AppText variant="caption" color={chrome.textSoft} numberOfLines={1} style={styles.streetText}>
            {street}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start', gap: 6, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  bubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleOver: { backgroundColor: '#e11d48', borderColor: '#e11d48' },
  value: { fontSize: 24, lineHeight: 27 },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  unit: { fontSize: 8 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  liveDotOff: { backgroundColor: colors.dim },
  limit: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: '#e11d48',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitText: { fontSize: 12, color: '#0b0f14' },
  street: {
    maxWidth: 200,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  streetText: { fontSize: 11 },
});
