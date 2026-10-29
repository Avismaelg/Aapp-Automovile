import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { FuelLogList } from '@/src/components/fuel/FuelLogList';
import { FuelSummaryCard } from '@/src/components/fuel/FuelSummaryCard';
import { NextMaintenanceCard } from '@/src/components/fuel/NextMaintenanceCard';
import { Segment } from '@/src/components/fuel/Segment';
import { VehiclePill } from '@/src/components/fuel/VehiclePill';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  Screen,
  SectionHeader,
} from '@/src/components/ui';
import type { Vehicle } from '@/src/types/models';
import { useFuelLogs } from '@/src/hooks/useFuelLogs';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { formatMoney, formatNumber } from '@/src/lib/format';
import {
  calculateElectric,
  calculateFuel,
  logEnergy,
  realEfficiencyHistory,
  type EfficiencyUnit,
  type ElectricEfficiencyUnit,
  type PriceUnit,
} from '@/src/lib/fuel';
import { exportFuelReport } from '@/src/lib/pdf';
import { isElectric, vehicleKindMeta } from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

const efficiencyOptions: { key: EfficiencyUnit; label: string; suffix: string }[] = [
  { key: 'km_l', label: 'km/L', suffix: 'km/L' },
  { key: 'l_100km', label: 'L/100', suffix: 'L/100km' },
  { key: 'mpg', label: 'MPG', suffix: 'MPG' },
];

const electricOptions: { key: ElectricEfficiencyUnit; label: string; suffix: string }[] = [
  { key: 'kwh_100km', label: 'kWh/100', suffix: 'kWh/100km' },
  { key: 'km_kwh', label: 'km/kWh', suffix: 'km/kWh' },
];

export default function FuelScreen() {
  const router = useRouter();
  const { vehicles: garageVehicles, isLoading, isError, refetch } = useGarageVehicles();

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.accent} />
          <AppText variant="caption" color={colors.muted}>
            Cargando tu garaje…
          </AppText>
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <EmptyState
          icon="cloud-offline-outline"
          title="No pudimos cargar tus vehículos"
          description="Revisa tu conexión y vuelve a intentarlo."
        />
        <Button label="Reintentar" variant="secondary" onPress={() => refetch()} />
      </Screen>
    );
  }

  if (garageVehicles.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="car-sport-outline"
          title="Primero añade un vehículo"
          description="El consumo real empieza con tu primer coche, moto, EV o camión."
        />
        <Button
          label="Añadir vehículo"
          icon="add"
          onPress={() => router.push('/vehicle/new')}
        />
      </Screen>
    );
  }

  return <FuelDashboard availableVehicles={garageVehicles} />;
}

function FuelDashboard({ availableVehicles }: { availableVehicles: Vehicle[] }) {
  const [selectedVehicleId, setSelectedVehicleId] = useState(availableVehicles[0].id);
  const vehicle =
    availableVehicles.find((item) => item.id === selectedVehicleId) ?? availableVehicles[0];
  const electric = isElectric(vehicle);
  const meta = vehicleKindMeta[vehicle.kind];

  const [distance, setDistance] = useState('320');
  const [efficiency, setEfficiency] = useState(String(vehicle.efficiency));
  const [price, setPrice] = useState(electric ? '18.50' : '293.60');
  const [efficiencyUnit, setEfficiencyUnit] = useState<EfficiencyUnit>('km_l');
  const [electricUnit, setElectricUnit] = useState<ElectricEfficiencyUnit>('kwh_100km');
  const [priceUnit, setPriceUnit] = useState<PriceUnit>('gal');
  const router = useRouter();
  const { logs } = useFuelLogs(availableVehicles);

  const vehicleLogs = logs.filter((log) => log.vehicleId === vehicle.id);

  const liquidResult = useMemo(
    () =>
      calculateFuel({
        distanceKm: Number(distance.replace(',', '.')) || 0,
        efficiency: Number(efficiency.replace(',', '.')) || 0,
        efficiencyUnit,
        pricePerUnit: Number(price.replace(',', '.')) || 0,
        priceUnit,
      }),
    [distance, efficiency, efficiencyUnit, price, priceUnit],
  );

  const electricResult = useMemo(
    () =>
      calculateElectric({
        distanceKm: Number(distance.replace(',', '.')) || 0,
        efficiency: Number(efficiency.replace(',', '.')) || 0,
        efficiencyUnit: electricUnit,
        pricePerKwh: Number(price.replace(',', '.')) || 0,
      }),
    [distance, efficiency, electricUnit, price],
  );

  const resultCost = electric ? electricResult.cost : liquidResult.cost;
  const resultEnergy = electric ? electricResult.kwh : liquidResult.liters;
  const costPerKm =
    Number(distance.replace(',', '.')) > 0
      ? resultCost / Number(distance.replace(',', '.'))
      : 0;
  const totalSpent = vehicleLogs.reduce((sum, log) => sum + log.total, 0);
  const totalEnergy = vehicleLogs.reduce((sum, log) => sum + logEnergy(log), 0);
  const efficiencyHistory = realEfficiencyHistory(vehicleLogs);

  const selectVehicle = (next: Vehicle) => {
    setSelectedVehicleId(next.id);
    setDistance('320');
    setEfficiency(String(next.efficiency));
    setPrice(next.kind === 'ev' ? '18.50' : next.fuel === 'diesel' ? '272.00' : '293.60');
    setEfficiencyUnit('km_l');
    setElectricUnit('kwh_100km');
    setPriceUnit('gal');
  };

  const changeEfficiencyUnit = (next: EfficiencyUnit) => {
    const current = Number(efficiency.replace(',', '.')) || 0;
    const kmPerL =
      efficiencyUnit === 'km_l'
        ? current
        : efficiencyUnit === 'l_100km'
          ? current > 0
            ? 100 / current
            : 0
          : current * 0.425143707;
    const converted =
      next === 'km_l'
        ? kmPerL
        : next === 'l_100km'
          ? kmPerL > 0
            ? 100 / kmPerL
            : 0
          : kmPerL / 0.425143707;
    setEfficiencyUnit(next);
    setEfficiency(formatNumber(converted, 1));
  };

  const changeElectricUnit = (next: ElectricEfficiencyUnit) => {
    const current = Number(efficiency.replace(',', '.')) || 0;
    const kwhPer100 =
      electricUnit === 'kwh_100km' ? current : current > 0 ? 100 / current : 0;
    const converted =
      next === 'kwh_100km' ? kwhPer100 : kwhPer100 > 0 ? 100 / kwhPer100 : 0;
    setElectricUnit(next);
    setEfficiency(formatNumber(converted, 1));
  };

  const changePriceUnit = (next: PriceUnit) => {
    const current = Number(price.replace(',', '.')) || 0;
    if (next === priceUnit) return;
    const converted = next === 'gal' ? current * 3.785411784 : current / 3.785411784;
    setPriceUnit(next);
    setPrice(formatNumber(converted, 2));
  };

  const openNewLog = () => router.push(`/vehicle/fuel/new?vehicleId=${vehicle.id}` as Href);

  const exportPdf = async () => {
    if (vehicleLogs.length === 0) {
      Alert.alert('Sin registros', 'Registra al menos un repostaje o una carga para exportar.');
      return;
    }
    try {
      await exportFuelReport({
        vehicle: `${vehicle.make} ${vehicle.model} ${vehicle.year}`,
        logs: vehicleLogs,
        currency: 'DOP',
      });
    } catch {
      Alert.alert('No se pudo exportar', 'Inténtalo de nuevo desde un dispositivo compatible.');
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="label" color={colors.accent}>ENERGÍA Y RUTAS</AppText>
          <AppText variant="h1" style={{ marginTop: 4 }}>Tu rendimiento</AppText>
        </View>
        <IconButton icon="download-outline" onPress={exportPdf} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.vehicleScroll}
        contentContainerStyle={styles.vehicleRow}
      >
        {availableVehicles.map((item) => (
          <VehiclePill
            key={item.id}
            vehicle={item}
            active={item.id === vehicle.id}
            onPress={() => selectVehicle(item)}
          />
        ))}
      </ScrollView>

      <FuelSummaryCard
        vehicle={vehicle}
        electric={electric}
        history={efficiencyHistory}
        costPerKm={costPerKm}
        totalSpent={totalSpent}
        totalEnergy={totalEnergy}
      />

      <SectionHeader title="Calculadora de viaje" />
      <Card style={styles.calculator}>
        <View style={styles.calculatorHeading}>
          <View style={[styles.calculatorIcon, electric && { backgroundColor: 'rgba(77,225,255,0.12)' }]}>
            <Ionicons
              name={electric ? 'flash' : 'calculator'}
              size={18}
              color={electric ? colors.cyan : colors.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">¿Cuánto cuesta esta ruta?</AppText>
            <AppText variant="caption" color={colors.muted}>
              Usa el consumo real de tu {meta.shortLabel.toLowerCase()}.
            </AppText>
          </View>
        </View>

        <View style={styles.fieldRow}>
          <Input
            label="Distancia"
            value={distance}
            onChangeText={setDistance}
            keyboardType="decimal-pad"
            placeholder="320"
            rightSlot={<AppText variant="caption" color={colors.muted}>km</AppText>}
            style={{ flex: 1.2 }}
          />
          <Input
            label={electric ? 'Consumo' : 'Rendimiento'}
            value={efficiency}
            onChangeText={setEfficiency}
            keyboardType="decimal-pad"
            placeholder={electric ? '15.8' : '14.2'}
            rightSlot={
              <AppText variant="caption" color={colors.muted}>
                {electric
                  ? electricOptions.find((option) => option.key === electricUnit)?.suffix
                  : efficiencyOptions.find((option) => option.key === efficiencyUnit)?.suffix}
              </AppText>
            }
            style={{ flex: 1 }}
          />
        </View>

        <View style={styles.segmentRow}>
          {electric ? (
            <Segment
              options={electricOptions.map((option) => ({ key: option.key, label: option.label }))}
              value={electricUnit}
              onChange={changeElectricUnit}
            />
          ) : (
            <Segment
              options={efficiencyOptions.map((option) => ({ key: option.key, label: option.label }))}
              value={efficiencyUnit}
              onChange={changeEfficiencyUnit}
            />
          )}
        </View>

        <Input
          label={electric ? 'Precio de la energía' : 'Precio del combustible'}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder={electric ? '18.50' : '293.60'}
          rightSlot={
            <View style={styles.priceUnit}>
              <AppText variant="caption" color={colors.muted}>
                DOP / {electric ? 'kWh' : priceUnit === 'gal' ? 'gal' : 'L'}
              </AppText>
            </View>
          }
        />

        {!electric ? (
          <View style={styles.priceToggle}>
            <Segment
              options={[
                { key: 'gal' as PriceUnit, label: 'Por galón' },
                { key: 'l' as PriceUnit, label: 'Por litro' },
              ]}
              value={priceUnit}
              onChange={changePriceUnit}
            />
          </View>
        ) : (
          <View style={styles.evHint}>
            <Ionicons name="home-outline" size={14} color={colors.cyan} />
            <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
              Tarifa de referencia: carga en casa o supercargador. Ajusta tu precio real.
            </AppText>
          </View>
        )}

        <View style={styles.resultGrid}>
          <View style={styles.resultCell}>
            <AppText variant="label" color={colors.muted}>{electric ? 'kWh' : 'Litros'}</AppText>
            <AppText variant="h3">{formatNumber(resultEnergy, 2)}</AppText>
          </View>
          <View style={styles.resultCell}>
            <AppText variant="label" color={colors.muted}>Costo</AppText>
            <AppText variant="h3" color={colors.accent}>{formatMoney(resultCost, 'DOP')}</AppText>
          </View>
          <View style={styles.resultCell}>
            <AppText variant="label" color={colors.muted}>
              {electric ? 'kWh/100 km' : 'L/100 km'}
            </AppText>
            <AppText variant="h3">
              {electric
                ? formatNumber(electricResult.kwhPer100km, 1)
                : formatNumber(liquidResult.lPer100km, 1)}
            </AppText>
          </View>
          <View style={styles.resultCell}>
            <AppText variant="label" color={colors.muted}>{electric ? 'km/kWh' : 'MPG'}</AppText>
            <AppText variant="h3">
              {electric
                ? formatNumber(electricResult.kmPerKwh, 1)
                : formatNumber(liquidResult.mpg, 1)}
            </AppText>
          </View>
        </View>

        <Button
          label="Exportar PDF"
          icon="document-text-outline"
          variant="ghost"
          onPress={exportPdf}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      <SectionHeader
        title={electric ? 'Historial de cargas' : 'Historial'}
        action={vehicleLogs.length ? `${vehicleLogs.length} registros` : undefined}
      />
      <Button
        label={electric ? 'Registrar carga' : 'Registrar repostaje'}
        icon={electric ? 'flash-outline' : 'add-circle-outline'}
        onPress={openNewLog}
        style={{ marginBottom: spacing.md }}
      />
      <FuelLogList logs={vehicleLogs} electric={electric} />

      <NextMaintenanceCard vehicle={vehicle} />

      <View style={styles.footer}>
        <Ionicons name="information-circle-outline" size={13} color={colors.dim} />
        <AppText variant="caption" color={colors.dim}>
          {electric
            ? 'Cálculo con consumo de energía real. Ajusta unidades en tu perfil.'
            : 'Cálculo con método de tanque lleno. Ajusta unidades en tu perfil.'}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stateBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing['4xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  vehicleScroll: { marginTop: spacing.lg, marginHorizontal: -spacing.xl },
  vehicleRow: { gap: 8, paddingHorizontal: spacing.xl },
  calculator: { gap: spacing.md },
  calculatorHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  calculatorIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldRow: { flexDirection: 'row', gap: 10 },
  segmentRow: { marginTop: -4 },
  priceToggle: { marginTop: -4 },
  priceUnit: { flexDirection: 'row', alignItems: 'center' },
  evHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(77,225,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(77,225,255,0.14)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  resultGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
    backgroundColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  resultCell: {
    width: '49.6%',
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    gap: 3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
});
