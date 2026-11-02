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
import { useAddFuelLog, useFuelLogs, useUpdateFuelLog } from '@/src/hooks/useFuelLogs';
import { fromLiters, localDateInput, toLiters, validateFuelEntry, type VolumeUnit } from '@/src/lib/fuel-entry';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { errorMessage } from '@/src/lib/alerts';
import { formatMoney } from '@/src/lib/format';
import { isElectric } from '@/src/lib/vehicles';
import type { FuelLog, Vehicle } from '@/src/types/models';
import { colors, radius, spacing } from '@/src/theme';
import { displayToKm, distanceUnit, formatKmValue, getCurrency, kmToDisplay, t } from '@/src/i18n';

function parseNumber(value: string) {
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : NaN;
}

export default function NewFuelLogScreen() {
  const router = useRouter();
  const { vehicleId, logId } = useLocalSearchParams<{ vehicleId: string; logId?: string }>();
  const { vehicles, isLoading } = useGarageVehicles();
  const { logs } = useFuelLogs(vehicles);
  const existing = logId ? logs.find((log) => log.id === logId) : undefined;
  const vehicle =
    vehicles.find((item) => item.id === (existing?.vehicleId ?? vehicleId)) ?? vehicles[0];

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

  return (
    <FuelLogForm
      key={`${vehicle.id}-${existing?.id ?? 'new'}`}
      vehicle={vehicle}
      logs={logs}
      existing={existing}
      onDone={goBack}
    />
  );
}

// Repostaje o carga real: fecha, odómetro, cantidad e importe tal como
// aparecen en el surtidor o el cargador. Con el tanque lleno sirve para
// calcular el consumo. Con `existing` se edita un registro ya guardado (RF-09).
function FuelLogForm({
  vehicle,
  logs,
  existing,
  onDone,
}: {
  vehicle: Vehicle;
  logs: FuelLog[];
  existing?: FuelLog;
  onDone: () => void;
}) {
  const electric = isElectric(vehicle);
  const addFuelLog = useAddFuelLog();
  const updateFuelLog = useUpdateFuelLog();
  const saving = addFuelLog.isPending || updateFuelLog.isPending;
  const others = logs.filter((log) => log.vehicleId === vehicle.id && log.id !== existing?.id);
  const lastOdometer = Math.max(existing ? 0 : vehicle.odometerKm, ...others.map((log) => log.odometer), 0);

  const [volumeUnit, setVolumeUnit] = useState<VolumeUnit>('L');
  const unit = electric ? 'kWh' : volumeUnit;
  const [date, setDate] = useState(() =>
    localDateInput(existing?.filledAt ? new Date(existing.filledAt) : new Date()),
  );
  const [odometer, setOdometer] = useState(() =>
    existing ? String(Math.round(kmToDisplay(existing.odometer))) : '',
  );
  const [amount, setAmount] = useState(() =>
    existing ? String(electric ? existing.kwh ?? 0 : Number(existing.liters.toFixed(2))) : '',
  );
  const [total, setTotal] = useState(() => (existing ? String(existing.total) : ''));
  const [fullTank, setFullTank] = useState(existing?.fullTank ?? true);
  const [station, setStation] = useState(existing?.station ?? '');
  const [error, setError] = useState<string | null>(null);

  const amountNumber = parseNumber(amount);
  const totalNumber = parseNumber(total);
  const pricePerUnit = amountNumber > 0 && totalNumber > 0 ? totalNumber / amountNumber : null;

  const changeUnit = (next: VolumeUnit) => {
    if (next === volumeUnit) return;
    const liters = toLiters(parseNumber(amount), volumeUnit);
    if (Number.isFinite(liters) && liters > 0) setAmount(String(Number(fromLiters(liters, next).toFixed(2))));
    setVolumeUnit(next);
  };

  const save = async () => {
    setError(null);
    const odometerNumber = Math.round(displayToKm(parseNumber(odometer)));
    // Registros vecinos por fecha (o por odómetro si no hay fecha).
    const when = (log: FuelLog) => (log.filledAt ? Date.parse(log.filledAt) : log.odometer);
    const target = existing?.filledAt ? Date.parse(existing.filledAt) : Number.POSITIVE_INFINITY;
    const before = others.filter((log) => when(log) <= target).map((log) => log.odometer);
    const after = existing ? others.filter((log) => when(log) > target).map((log) => log.odometer) : [];
    const check = validateFuelEntry({
      odometerKm: odometerNumber,
      amount: amountNumber,
      total: totalNumber,
      date,
      previousOdometerKm: existing ? (before.length ? Math.max(...before) : null) : lastOdometer || null,
      nextOdometerKm: after.length ? Math.min(...after) : null,
      electric,
    });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const volume = electric ? amountNumber : toLiters(amountNumber, volumeUnit);
    const input = {
      vehicle,
      volume,
      pricePerUnit: totalNumber / volume,
      total: totalNumber,
      odometer: odometerNumber,
      station: station.trim() || undefined,
      fullTank,
      filledAt: check.filledAt,
    };

    try {
      if (existing) await updateFuelLog.mutateAsync({ log: existing, input });
      else await addFuelLog.mutateAsync(input);
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
            <AppText variant="h1">
              {existing
                ? t('Editar registro')
                : electric
                  ? t('Registra la carga.')
                  : t('Registra el repostaje.')}
            </AppText>
            <AppText variant="body" color={colors.muted} style={{ marginTop: 6 }}>
              {vehicle.make} {vehicle.model}{' '}{t('· último registro')}{' '}{formatKmValue(lastOdometer)}
            </AppText>
          </View>

          <Card style={styles.section}>
            <Input
              label={t('Fecha')}
              value={date}
              onChangeText={setDate}
              placeholder="AAAA-MM-DD"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
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
            {!electric ? (
              <View style={styles.row}>
                {(['L', 'gal'] as const).map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => changeUnit(option)}
                    style={[styles.unitChip, volumeUnit === option && styles.unitChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: volumeUnit === option }}
                  >
                    <AppText variant="bodyStrong" color={volumeUnit === option ? colors.text : colors.muted}>
                      {option === 'L' ? t('Litros') : t('Galones')}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}
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
            label={
              saving
                ? t('Guardando…')
                : existing
                  ? t('Guardar cambios')
                  : electric
                    ? t('Guardar carga')
                    : t('Guardar repostaje')
            }
            icon="checkmark-circle-outline"
            size="lg"
            loading={saving}
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
  unitChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
  },
  unitChipActive: { borderColor: colors.accent, backgroundColor: colors.surfaceHigh },
});
