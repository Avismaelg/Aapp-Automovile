import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthNotice } from '@/src/components/auth';
import { AppText, Button, Card, IconButton, Input } from '@/src/components/ui';
import { useAddFuelLog, useFuelLogs } from '@/src/hooks/useFuelLogs';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { errorMessage } from '@/src/lib/alerts';
import { formatMoney } from '@/src/lib/format';
import { isElectric } from '@/src/lib/vehicles';
import type { Vehicle } from '@/src/types/models';
import { colors, radius, spacing } from '@/src/theme';
import { displayToKm, distanceUnit, formatKmValue, getCurrency, t } from '@/src/i18n';

function parseNumber(value: string) {
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : NaN;
}

export default function NewFuelLogScreen() {
  const router = useRouter();
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const { vehicles, isLoading } = useGarageVehicles();
  const vehicle = vehicles.find((item) => item.id === vehicleId) ?? vehicles[0];

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/fuel');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <Ionicons name="car-outline" size={36} color={colors.dim} />
        <AppText variant="h2" align="center" style={{ marginTop: spacing.md }}>
          {t('No encontramos el vehículo')}
        </AppText>
        <Button label={t('Volver')} variant="secondary" onPress={goBack} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  return <FuelLogForm key={vehicle.id} vehicle={vehicle} vehicles={vehicles} onDone={goBack} />;
}

// Repostaje o carga real: odómetro, cantidad e importe tal como aparecen en el
// surtidor o el cargador. Con el tanque lleno sirve para calcular el consumo.
function FuelLogForm({
  vehicle,
  vehicles,
  onDone,
}: {
  vehicle: Vehicle;
  vehicles: Vehicle[];
  onDone: () => void;
}) {
  const electric = isElectric(vehicle);
  const unit = electric ? 'kWh' : 'L';
  const addFuelLog = useAddFuelLog();
  const { logs } = useFuelLogs(vehicles);
  const lastOdometer = Math.max(
    vehicle.odometerKm,
    ...logs.filter((log) => log.vehicleId === vehicle.id).map((log) => log.odometer),
  );

  const [odometer, setOdometer] = useState('');
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState('');
  const [fullTank, setFullTank] = useState(true);
  const [station, setStation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amountNumber = parseNumber(amount);
  const totalNumber = parseNumber(total);
  const pricePerUnit = amountNumber > 0 && totalNumber > 0 ? totalNumber / amountNumber : null;

  const save = async () => {
    setError(null);
    const odometerNumber = Math.round(displayToKm(parseNumber(odometer)));
    if (!(odometerNumber > 0)) {
      setError(t('Escribe los kilómetros que marca el odómetro.'));
      return;
    }
    if (odometerNumber < lastOdometer) {
      setError(t('El odómetro no puede ser menor que el último registro ({0}).', formatKmValue(lastOdometer)));
      return;
    }
    if (!(amountNumber > 0)) {
      setError(electric ? t('Escribe los kWh cargados.') : t('Escribe los litros repostados.'));
      return;
    }
    if (!(totalNumber > 0) || pricePerUnit == null) {
      setError(t('Escribe el importe total pagado.'));
      return;
    }

    try {
      await addFuelLog.mutateAsync({
        vehicle,
        volume: amountNumber,
        pricePerUnit,
        total: totalNumber,
        odometer: odometerNumber,
        station: station.trim() || undefined,
        fullTank,
      });
      onDone();
    } catch (saveError) {
      setError(errorMessage(saveError, t('No pudimos guardar el registro.')));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.header}>
            <IconButton icon="close" size={40} onPress={onDone} />
            <AppText variant="label" color={colors.accent}>
              {electric ? 'CARGA' : 'REPOSTAJE'}
            </AppText>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.heading}>
            <AppText variant="h1">{electric ? t('Registra la carga.') : t('Registra el repostaje.')}</AppText>
            <AppText variant="body" color={colors.muted} style={{ marginTop: 6 }}>
              {vehicle.make} {vehicle.model}{' '}{t('· último registro')}{' '}{formatKmValue(lastOdometer)}
            </AppText>
          </View>

          <Card style={styles.section}>
            <Input
              label={t('Odómetro')}
              value={odometer}
              onChangeText={setOdometer}
              placeholder={String(Math.round(lastOdometer))}
              keyboardType="decimal-pad"
              rightSlot={<AppText variant="caption" color={colors.dim}>{distanceUnit()}</AppText>}
            />
            <View style={styles.row}>
              <Input
                label={electric ? t('Energía') : t('Cantidad')}
                value={amount}
                onChangeText={setAmount}
                placeholder={electric ? '42' : '38,5'}
                keyboardType="decimal-pad"
                rightSlot={<AppText variant="caption" color={colors.dim}>{unit}</AppText>}
                style={styles.flex}
              />
              <Input
                label={t('Importe')}
                value={total}
                onChangeText={setTotal}
                placeholder="0"
                keyboardType="decimal-pad"
                rightSlot={<AppText variant="caption" color={colors.dim}>{getCurrency()}</AppText>}
                style={styles.flex}
              />
            </View>
            <AppText variant="caption" color={colors.muted}>
              {pricePerUnit != null
                ? t('Precio: {0} por {1}', formatMoney(pricePerUnit), unit)
                : t('El precio por unidad se calcula con la cantidad y el importe.')}
            </AppText>

            <Pressable
              onPress={() => setFullTank((value) => !value)}
              style={[styles.toggle, fullTank && styles.toggleActive]}
              accessibilityRole="switch"
              accessibilityState={{ checked: fullTank }}
            >
              <Ionicons
                name={fullTank ? 'checkbox' : 'square-outline'}
                size={20}
                color={fullTank ? colors.lime : colors.muted}
              />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{electric ? t('Batería al 100 %') : t('Tanque lleno')}</AppText>
                <AppText variant="caption" color={colors.muted}>
                  {t('Necesario para calcular tu consumo real entre registros.')}
                </AppText>
              </View>
            </Pressable>

            <Input
              label={electric ? t('Cargador') : t('Estación')}
              value={station}
              onChangeText={setStation}
              placeholder={electric ? t('Casa, supercargador…') : t('Nombre de la estación')}
              maxLength={120}
            />
          </Card>

          {error ? <AuthNotice message={error} /> : null}

          <Button
            label={addFuelLog.isPending ? 'Guardando…' : electric ? t('Guardar carga') : t('Guardar repostaje')}
            icon="checkmark-circle-outline"
            size="lg"
            loading={addFuelLog.isPending}
            onPress={save}
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  state: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  heading: {
    marginTop: spacing['2xl'],
    marginBottom: spacing.lg,
  },
  section: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  toggleActive: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
});
