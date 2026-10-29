import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/src/components/ui';
import { logEnergy, logUnit } from '@/src/lib/fuel';
import type { FuelLog } from '@/src/types/models';
import { formatMoney, formatNumber } from '@/src/lib/format';
import { colors, spacing } from '@/src/theme';

export function FuelLogList({ logs, electric }: { logs: FuelLog[]; electric: boolean }) {
  return logs.length === 0 ? (
    <Card style={styles.emptyCard}>
      <Ionicons name="battery-half-outline" size={24} color={colors.dim} />
      <AppText variant="bodyStrong" style={{ marginTop: 8 }}>
        Sin registros para este vehículo
      </AppText>
      <AppText variant="caption" color={colors.muted} align="center" style={{ marginTop: 4 }}>
        Guarda tu primer repostaje o carga para ver el consumo real.
      </AppText>
    </Card>
  ) : (
    logs.map((log) => (
      <Card key={log.id} style={styles.logCard}>
        <View
          style={[
            styles.logIcon,
            { backgroundColor: 'rgba(77,225,255,0.1)' },
          ]}
        >
          <Ionicons
            name={electric ? 'flash' : 'water'}
            size={19}
            color={colors.cyan}
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.logTop}>
            <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {log.station}
            </AppText>
            <AppText variant="bodyStrong">{formatMoney(log.total, 'DOP')}</AppText>
          </View>
          <View style={styles.logBottom}>
            <AppText variant="caption" color={colors.muted}>{log.date}</AppText>
            <View style={styles.logDot} />
            <AppText variant="caption" color={colors.muted}>
              {formatNumber(logEnergy(log), 2)} {logUnit(log)}
            </AppText>
            <View style={styles.logDot} />
            <AppText variant="caption" color={colors.muted}>
              {formatNumber(log.odometer, 0)} km
            </AppText>
          </View>
        </View>
      </Card>
    ))
  );
}

const styles = StyleSheet.create({
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xl },
  logCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 8,
    paddingVertical: 14,
  },
  logIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  logDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.dim },
});
