import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText, Pill, Stat } from '@/src/components/ui';
import { Trend } from '@/src/components/fuel/Trend';
import { efficiencyChangePercent } from '@/src/lib/fuel';
import type { Vehicle } from '@/src/types/models';
import { formatMoney, formatNumber } from '@/src/lib/format';
import { vehicleKindMeta } from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

type Props = {
  vehicle: Vehicle;
  electric: boolean;
  /** Consumos reales del más antiguo al más reciente (km/L o kWh/100 km). */
  history: number[];
  costPerKm: number;
  totalSpent: number;
  totalEnergy: number;
};

// Resumen del vehículo. Solo muestra tendencia y variación cuando hay
// registros suficientes: nunca datos de ejemplo.
export function FuelSummaryCard({
  vehicle,
  electric,
  history,
  costPerKm,
  totalSpent,
  totalEnergy,
}: Props) {
  const meta = vehicleKindMeta[vehicle.kind];
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const change = efficiencyChangePercent(history, electric);
  const trend = history.slice(-7);

  return (
    <LinearGradient
      colors={electric ? ['#0C1A1D', '#10151B', '#0F1318'] : ['#111A12', '#10151B', '#0F1318']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.summary, electric && styles.summaryElectric]}
    >
      <View style={styles.summaryLabelRow}>
        <AppText variant="label" color={colors.muted} style={{ flex: 1 }}>
          {latest == null ? 'Consumo de referencia' : electric ? 'Consumo eléctrico real' : 'Último consumo'}
        </AppText>
        <View style={[styles.kindBadge, { borderColor: `${meta.color}55` }]}>
          <Ionicons name={meta.icon} size={11} color={meta.color} />
          <AppText variant="label" color={meta.color} style={{ fontSize: 8 }}>
            {meta.shortLabel.toUpperCase()}
          </AppText>
        </View>
      </View>

      <View style={styles.summaryTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.summaryValueRow}>
            <AppText variant="display" style={{ fontSize: 40 }}>
              {formatNumber(latest ?? vehicle.efficiency, 1)}
            </AppText>
          </View>
          <AppText variant="caption" color={colors.textSoft} style={{ marginTop: -2 }}>
            {electric ? 'kWh/100 km' : 'km/L'}
          </AppText>
          {change != null ? (
            <View style={styles.summaryTrendLabel}>
              <Pill
                label={`${change >= 0 ? '+' : ''}${formatNumber(change, 1)} %`}
                tone={change >= 0 ? 'lime' : 'accent'}
                icon={change >= 0 ? 'trending-up' : 'trending-down'}
              />
              <AppText variant="label" color={colors.dim} style={{ fontSize: 8 }}>
                VS. REGISTRO ANTERIOR
              </AppText>
            </View>
          ) : (
            <AppText variant="caption" color={colors.dim} style={{ marginTop: spacing.sm }}>
              Registra dos repostajes con el tanque lleno para ver tu consumo real.
            </AppText>
          )}
        </View>
        {trend.length >= 2 ? (
          <View style={styles.trendBox}>
            <Trend
              values={trend}
              color={electric ? colors.cyan : colors.lime}
              width={138}
              height={44}
            />
            <AppText variant="label" color={colors.dim} style={{ fontSize: 8, marginTop: 4 }}>
              ÚLTIMOS REGISTROS
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.summaryStats}>
        <Stat value={formatNumber(costPerKm, 2)} label="DOP / km" accent={meta.color} />
        <View style={styles.summaryDivider} />
        <Stat value={formatMoney(totalSpent, 'DOP')} label="gastado" />
        <View style={styles.summaryDivider} />
        <Stat value={`${formatNumber(totalEnergy, 0)} ${electric ? 'kWh' : 'L'}`} label="cargados" />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  summary: {
    marginTop: spacing.md,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(46,230,168,0.18)',
    padding: spacing.xl,
    overflow: 'hidden',
  },
  summaryElectric: { borderColor: 'rgba(77,225,255,0.2)' },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  summaryTrendLabel: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  kindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  summaryValueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  trendBox: { width: 142, alignItems: 'flex-end', paddingTop: 6 },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  summaryDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: spacing.lg },
});
