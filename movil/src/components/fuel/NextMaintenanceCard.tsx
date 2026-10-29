import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/src/components/ui';
import { useMaintenance } from '@/src/hooks/useMaintenance';
import type { Vehicle } from '@/src/types/models';
import { formatNumber } from '@/src/lib/format';
import { colors, spacing } from '@/src/theme';

// Próximo servicio según los mantenimientos registrados con "próximo a los
// X km". Sin registros invita a crear uno en lugar de inventar una fecha.
export function NextMaintenanceCard({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter();
  const { records } = useMaintenance(vehicle.id);
  const next = useMemo(
    () =>
      records
        .filter((record) => record.nextKm != null && record.nextKm > record.odometerKm)
        .sort((a, b) => (a.nextKm ?? 0) - (b.nextKm ?? 0))[0] ?? null,
    [records],
  );
  const openNew = () => router.push(`/vehicle/maintenance/new?vehicleId=${vehicle.id}`);

  if (!next || next.nextKm == null) {
    return (
      <Pressable onPress={openNew} accessibilityRole="button">
        <Card style={styles.maintenance}>
          <View style={styles.maintenanceIcon}>
            <Ionicons name="construct" size={20} color={colors.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Próximo mantenimiento</AppText>
            <AppText variant="caption" color={colors.muted}>
              Registra un servicio con su próximo kilometraje y te avisaremos aquí.
            </AppText>
          </View>
          <Ionicons name="add-circle-outline" size={18} color={colors.lime} />
        </Card>
      </Pressable>
    );
  }

  const remainingKm = next.nextKm - vehicle.odometerKm;
  const span = next.nextKm - next.odometerKm;
  const used = Math.min(1, Math.max(0, (vehicle.odometerKm - next.odometerKm) / span));
  const overdue = remainingKm <= 0;
  const tint = overdue ? colors.danger : used > 0.85 ? colors.accent : colors.lime;

  return (
    <Card style={styles.maintenance}>
      <View style={styles.maintenanceIcon}>
        <Ionicons name="construct" size={20} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{next.title}</AppText>
        <AppText variant="caption" color={colors.muted}>
          {overdue
            ? `Vencido hace ${formatNumber(-remainingKm, 0)} km`
            : `En ${formatNumber(remainingKm, 0)} km · a los ${formatNumber(next.nextKm, 0)} km`}
        </AppText>
        <View style={styles.maintenanceTrack}>
          <View
            style={[styles.maintenanceFill, { width: `${Math.round(used * 100)}%`, backgroundColor: tint }]}
          />
        </View>
      </View>
      <AppText variant="label" color={tint} style={{ fontSize: 9 }}>
        {Math.round(used * 100)}%
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  maintenance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  maintenanceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maintenanceTrack: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  maintenanceFill: {
    width: '62%',
    height: '100%',
    backgroundColor: colors.lime,
    borderRadius: 2,
  },
});
