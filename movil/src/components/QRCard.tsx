import QRCode from 'react-native-qrcode-svg';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { colors, radius, spacing } from '@/src/theme';

export function QRCard({
  value,
  label = 'PERFIL',
  caption,
  size = 148,
  dark = false,
}: {
  value: string;
  label?: string;
  caption?: string;
  size?: number;
  dark?: boolean;
}) {
  const bg = dark ? colors.surface : '#F4F7FA';

  return (
    <View style={[styles.wrap, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <AppText
            variant="label"
            color={dark ? colors.text : '#0A0D12'}
            style={{ letterSpacing: 1.5 }}
          >
            CARAVANA
          </AppText>
        </View>
        <AppText
          variant="label"
          color={dark ? colors.muted : '#5A6577'}
          style={{ fontSize: 9 }}
        >
          {label}
        </AppText>
      </View>

      <View style={styles.qrBox}>
        <QRCode
          value={value}
          size={size}
          color="#0A0D12"
          backgroundColor="#FFFFFF"
        />
      </View>

      <AppText
        variant="caption"
        color={dark ? colors.textSoft : '#3A4555'}
        align="center"
        style={{ marginTop: spacing.md }}
      >
        {caption ?? 'Escanea para ver mi perfil'}
      </AppText>
      <AppText
        variant="label"
        color={dark ? colors.muted : '#7A8596'}
        align="center"
        style={{ fontSize: 8, marginTop: 3 }}
      >
        caravana.app
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: radius.md,
  },
});
