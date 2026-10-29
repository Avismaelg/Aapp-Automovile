import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import type { Vehicle } from '@/src/types/models';
import { vehicleKindMeta } from '@/src/lib/vehicles';
import { colors, radius } from '@/src/theme';

export function VehiclePill({
  vehicle,
  active,
  onPress,
}: {
  vehicle: Vehicle;
  active: boolean;
  onPress: () => void;
}) {
  const meta = vehicleKindMeta[vehicle.kind];
  return (
    <Pressable onPress={onPress} style={[styles.vehiclePill, active && styles.vehiclePillActive]}>
      <View style={[styles.vehiclePillIcon, { backgroundColor: `${meta.color}1F` }]}>
        <Ionicons name={meta.icon} size={16} color={meta.color} />
      </View>
      <View>
        <AppText variant="caption" color={active ? colors.text : colors.textSoft}>
          {vehicle.kind === 'car' ? vehicle.model : meta.shortLabel}
        </AppText>
        <AppText variant="label" color={active ? colors.accent : colors.dim} style={{ fontSize: 8 }}>
          {vehicle.make.toUpperCase()}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  vehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  vehiclePillActive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.accent,
  },
  vehiclePillIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
