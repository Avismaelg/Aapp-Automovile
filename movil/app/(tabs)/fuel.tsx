import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import {
  AppText,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  Pill,
  Screen,
  SectionHeader,
  Stat,
} from '@/src/components/ui';
import { showError } from '@/src/lib/alerts';
import type { FuelLog, Vehicle } from '@/src/types/models';
import { useAddFuelLog, useFuelLogs } from '@/src/hooks/useFuelLogs';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { formatMoney, formatNumber } from '@/src/lib/format';
import {
  calculateElectric,
  calculateFuel,
  logEnergy,
  logUnit,
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

const trendByKind: Record<string, number[]> = {
  car: [12.8, 13.4, 12.9, 13.8, 13.5, 14.1, 14.2],
  motorcycle: [21.2, 22.1, 21.8, 22.4, 22.0, 22.3, 22.5],
  ev: [17.2, 16.8, 16.4, 16.5, 16.1, 15.9, 15.8],
  truck: [9.2, 9.8, 9.5, 10.1, 9.9, 10.2, 10.5],
};

function Trend({
  values,
  color = colors.lime,
  width = 190,
  height = 52,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const { points, lastX, lastY } = useMemo(() => {
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const built = values.map((value, index) => {
      const x = 8 + (index / (values.length - 1)) * 174;
      const y = 44 - ((value - min) / range) * 30;
      return { x, y };
    });
    return {
      points: built.map((point) => `${point.x},${point.y}`).join(' '),
      lastX: built[built.length - 1].x,
      lastY: built[built.length - 1].y,
    };
  }, [values]);

  return (
    <Svg width={width} height={height} viewBox="0 0 190 52">
      <Path
        d={`M ${points.split(' ').join(' L ')}`}
        stroke={color}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={lastX} cy={lastY} r={4} fill={color} />
    </Svg>
  );
}

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <AppText
              variant="caption"
              color={active ? '#120802' : colors.muted}
              style={{ fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular' }}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function VehiclePill({
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
  const { logs: savedLogs } = useFuelLogs(availableVehicles);
  const addFuelLog = useAddFuelLog();
  const [pendingLogs, setPendingLogs] = useState<FuelLog[]>([]);

  const logs = useMemo(() => {
    const seen = new Set<string>();
    return [...pendingLogs, ...savedLogs].filter((log) => {
      if (seen.has(log.id)) return false;
      seen.add(log.id);
      return true;
    });
  }, [pendingLogs, savedLogs]);

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
  const summaryEfficiency = electric
    ? electricResult.kwhPer100km || vehicle.efficiency
    : liquidResult.kmPerL || vehicle.efficiency;
  const summaryUnit = electric ? 'kWh/100 km' : 'km/L';
  const trend = trendByKind[vehicle.kind] ?? trendByKind.car;

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

  const saveFillup = async () => {
    if (resultEnergy <= 0) {
      Alert.alert('Faltan datos', 'Completa la distancia, el consumo y el precio.');
      return;
    }

    const odometer =
      (vehicleLogs[0]?.odometer ?? vehicle.odometerKm) +
      (Number(distance.replace(',', '.')) || 0);

    try {
      const saved = await addFuelLog.mutateAsync({
        vehicle,
        volume: electric ? electricResult.kwh : liquidResult.liters,
        pricePerUnit: electric
          ? Number(price.replace(',', '.')) || 0
          : liquidResult.pricePerLiter,
        total: resultCost,
        odometer,
        station: electric ? 'Carga registrada' : 'Repostaje registrado',
        fullTank: true,
      });

      setPendingLogs((current) => [saved, ...current]);
      Alert.alert(
        electric ? 'Carga guardada' : 'Repostaje guardado',
        `${formatNumber(resultEnergy, 2)} ${electric ? 'kWh' : 'L'} · ${formatMoney(
          saved.total,
          'DOP',
        )}. El consumo se recalcula en el próximo registro.`,
      );
    } catch (error) {
      showError('No pudimos guardar el registro', error, 'Revisa tu conexión e inténtalo de nuevo.');
    }
  };

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

      <LinearGradient
        colors={electric ? ['#0C1A1D', '#10151B', '#0F1318'] : ['#111A12', '#10151B', '#0F1318']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.summary, electric && styles.summaryElectric]}
      >
        <View style={styles.summaryLabelRow}>
          <AppText variant="label" color={colors.muted} style={{ flex: 1 }}>
            {electric ? 'Consumo eléctrico' : 'Último consumo'}
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
                {formatNumber(summaryEfficiency, 1)}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.textSoft} style={{ marginTop: -2 }}>
              {summaryUnit}
            </AppText>
            <View style={styles.summaryTrendLabel}>
              <Pill
                label={electric ? '0 emisiones' : '+4,8 %'}
                tone="lime"
                icon={electric ? 'leaf' : 'trending-up'}
              />
              <AppText variant="label" color={colors.dim} style={{ fontSize: 8 }}>
                {electric ? 'ENERGÍA LIMPIA' : 'VS. MES PASADO'}
              </AppText>
            </View>
          </View>
          <View style={styles.trendBox}>
            <Trend
              values={trend}
              color={electric ? colors.cyan : colors.lime}
              width={138}
              height={44}
            />
            <AppText variant="label" color={colors.dim} style={{ fontSize: 8, marginTop: 4 }}>
              {electric ? 'ÚLTIMAS CARGAS' : '6 MESES'}
            </AppText>
          </View>
        </View>

        <View style={styles.summaryStats}>
          <Stat value={formatNumber(costPerKm, 2)} label="DOP / km" accent={meta.color} />
          <View style={styles.summaryDivider} />
          <Stat value={formatMoney(totalSpent, 'DOP')} label="gastado" />
          <View style={styles.summaryDivider} />
          <Stat
            value={`${formatNumber(totalEnergy, 0)} ${electric ? 'kWh' : 'L'}`}
            label={electric ? 'cargados' : 'cargados'}
          />
        </View>
      </LinearGradient>

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
          label={electric ? 'Guardar carga' : 'Guardar repostaje'}
          icon={electric ? 'flash-outline' : 'add-circle-outline'}
          loading={addFuelLog.isPending}
          onPress={saveFillup}
          style={{ marginTop: spacing.lg }}
        />
        <Button
          label="Exportar PDF"
          icon="document-text-outline"
          variant="ghost"
          onPress={exportPdf}
          style={{ marginTop: 8 }}
        />
      </Card>

      <SectionHeader
        title={electric ? 'Historial de cargas' : 'Historial'}
        action={vehicleLogs.length ? `${vehicleLogs.length} registros` : undefined}
      />
      {vehicleLogs.length === 0 ? (
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
        vehicleLogs.map((log) => (
          <Card key={log.id} style={styles.logCard}>
            <View
              style={[
                styles.logIcon,
                { backgroundColor: electric ? 'rgba(77,225,255,0.1)' : 'rgba(77,225,255,0.1)' },
              ]}
            >
              <Ionicons
                name={electric ? 'flash' : 'water'}
                size={19}
                color={electric ? colors.cyan : colors.cyan}
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
            <Ionicons name="chevron-forward" size={14} color={colors.dim} />
          </Card>
        ))
      )}

      <Card style={styles.maintenance}>
        <View style={styles.maintenanceIcon}>
          <Ionicons
            name={electric ? 'battery-charging' : 'construct'}
            size={20}
            color={colors.lime}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">
            {electric ? 'Salud de la batería' : 'Próximo mantenimiento'}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {electric
              ? `Revisión y neumáticos en ${formatNumber(vehicle.odometerKm + 1790, 0)} km · ${formatNumber(vehicle.odometerKm, 0)} km actuales`
              : `Aceite y filtros en ${formatNumber(vehicle.odometerKm + 1790, 0)} km · ${formatNumber(vehicle.odometerKm, 0)} km actuales`}
          </AppText>
          <View style={styles.maintenanceTrack}>
            <View
              style={[
                styles.maintenanceFill,
                { width: electric ? '92%' : '62%' },
                electric && { backgroundColor: colors.cyan },
              ]}
            />
          </View>
        </View>
        <AppText variant="label" color={colors.lime} style={{ fontSize: 9 }}>
          {electric ? '92%' : '62%'}
        </AppText>
      </Card>

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
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  segmentItemActive: { backgroundColor: colors.accent },
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
});
