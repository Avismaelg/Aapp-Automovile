import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthNotice } from '@/src/components/auth';
import {
  AppText,
  Button,
  Card,
  IconButton,
  Input,
  Pill,
} from '@/src/components/ui';
import type { FuelKind, VehicleKind } from '@/src/types/models';
import { useCreateVehicle, useGarageVehicles, useUpdateVehicle } from '@/src/hooks/useGarage';
import { DEFAULT_VEHICLE_COLORS } from '@/src/lib/vehicle-db';
import { vehicleKinds, vehicleKindMeta } from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

const fuelOptions: { key: FuelKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'gasoline', label: 'Gasolina', icon: 'water-outline' },
  { key: 'diesel', label: 'Diésel', icon: 'water' },
  { key: 'electric', label: 'Eléctrico', icon: 'flash' },
];

type FieldErrors = {
  make?: string;
  model?: string;
  year?: string;
  odometer?: string;
  efficiency?: string;
};

export default function NewVehicleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string | string[] }>();
  const vehicleId = Array.isArray(params.vehicleId) ? params.vehicleId[0] : params.vehicleId;
  const { vehicles, isDemo } = useGarageVehicles();
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const editingVehicle = vehicleId ? vehicles.find((item) => item.id === vehicleId) : undefined;

  const [kind, setKind] = useState<VehicleKind>('car');
  const [fuel, setFuel] = useState<FuelKind>('gasoline');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [nickname, setNickname] = useState('');
  const [odometer, setOdometer] = useState('0');
  const [efficiency, setEfficiency] = useState('12');
  const [color, setColor] = useState(DEFAULT_VEHICLE_COLORS[0]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loadedVehicleId, setLoadedVehicleId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingVehicle || loadedVehicleId === editingVehicle.id) return;
    const timer = setTimeout(() => {
      setKind(editingVehicle.kind);
      setFuel(editingVehicle.fuel);
      setMake(editingVehicle.make);
      setModel(editingVehicle.model);
      setYear(String(editingVehicle.year));
      setNickname(editingVehicle.nickname);
      setOdometer(String(editingVehicle.odometerKm));
      setEfficiency(String(editingVehicle.efficiency));
      setColor(editingVehicle.color);
      setLoadedVehicleId(editingVehicle.id);
    }, 0);
    return () => clearTimeout(timer);
  }, [editingVehicle, loadedVehicleId]);

  const meta = vehicleKindMeta[kind];
  const electric = kind === 'ev';
  const firstVehicle = !editingVehicle && vehicles.length === 0;

  const availableFuels =
    kind === 'ev'
      ? fuelOptions.filter((option) => option.key === 'electric')
      : kind === 'motorcycle'
        ? fuelOptions.filter((option) => option.key === 'gasoline')
        : fuelOptions.filter((option) => option.key !== 'electric');

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/garage');
  };

  const changeKind = (next: VehicleKind) => {
    setKind(next);
    setEfficiency(next === 'ev' ? '15.8' : next === 'truck' ? '10.5' : '12');
    setFuel(next === 'ev' ? 'electric' : next === 'truck' ? 'diesel' : 'gasoline');
    setErrors({});
  };

  const submit = async () => {
    setFormError(null);

    const nextErrors: FieldErrors = {};
    const yearNumber = Number.parseInt(year, 10);
    const odometerNumber = Number(odometer.replace(',', '.'));
    const efficiencyNumber = Number(efficiency.replace(',', '.'));

    if (!make.trim()) nextErrors.make = 'Escribe la marca.';
    if (!model.trim()) nextErrors.model = 'Escribe el modelo.';
    if (!Number.isFinite(yearNumber) || yearNumber < 1900 || yearNumber > 2100) {
      nextErrors.year = 'Usa un año entre 1900 y 2100.';
    }
    if (!Number.isFinite(odometerNumber) || odometerNumber < 0) {
      nextErrors.odometer = 'El odómetro debe ser un número positivo.';
    }
    if (!Number.isFinite(efficiencyNumber) || efficiencyNumber <= 0) {
      nextErrors.efficiency = 'Indica un consumo mayor que cero.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const input = {
        make,
        model,
        year: yearNumber,
        nickname,
        color,
        kind,
        fuel: electric ? 'electric' : fuel,
        efficiency: efficiencyNumber,
        odometerKm: odometerNumber,
        isPrimary: editingVehicle?.isPrimary ?? firstVehicle,
      };
      if (editingVehicle) {
        await updateVehicle.mutateAsync({ vehicleId: editingVehicle.id, input });
      } else {
        await createVehicle.mutateAsync(input);
      }
      goBack();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'No pudimos guardar el vehículo. Inténtalo de nuevo.',
      );
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
            <IconButton icon="close" size={40} onPress={goBack} />
            <AppText variant="label" color={colors.accent}>
              {editingVehicle ? 'EDITAR VEHÍCULO' : 'NUEVO VEHÍCULO'}
            </AppText>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.heading}>
            <AppText variant="h1">
              {editingVehicle ? 'Actualiza tu máquina.' : 'Añade tu máquina.'}
            </AppText>
            <AppText variant="body" color={colors.muted} style={{ marginTop: 6 }}>
              {editingVehicle
                ? 'Mantén al día sus datos para que el mapa, consumo y QR sean correctos.'
                : 'Cada coche, moto, EV o camión tiene su historial, consumo y QR propio.'}
            </AppText>
          </View>

          {isDemo ? (
            <AuthNotice
              tone="info"
              message="Estás en modo demo: el vehículo se guarda solo en este dispositivo."
            />
          ) : null}

          <View style={styles.section}>
            <AppText variant="label" color={colors.muted}>Tipo de vehículo</AppText>
            <View style={styles.kindGrid}>
              {vehicleKinds.map((item) => {
                const itemMeta = vehicleKindMeta[item];
                const active = item === kind;
                return (
                  <Pressable
                    key={item}
                    onPress={() => changeKind(item)}
                    accessibilityRole="radio"
                    accessibilityLabel={`Tipo ${itemMeta.shortLabel}`}
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.kindOption,
                      active && {
                        borderColor: itemMeta.color,
                        backgroundColor: `${itemMeta.color}14`,
                      },
                      pressed && { opacity: 0.82 },
                    ]}
                  >
                    <View
                      style={[
                        styles.kindIcon,
                        { backgroundColor: active ? `${itemMeta.color}22` : colors.surfaceHigh },
                      ]}
                    >
                      <Ionicons
                        name={itemMeta.icon}
                        size={21}
                        color={active ? itemMeta.color : colors.muted}
                      />
                    </View>
                    <AppText
                      variant="caption"
                      color={active ? colors.text : colors.textSoft}
                      style={{ marginTop: 5 }}
                    >
                      {itemMeta.shortLabel}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <AppText variant="label" color={colors.muted}>Identidad</AppText>
            <View style={styles.fields}>
              <Input
                label="Marca"
                value={make}
                onChangeText={(value) => {
                  setMake(value);
                  setErrors((current) => ({ ...current, make: undefined }));
                }}
                placeholder="Honda, Toyota, Tesla…"
                autoCapitalize="words"
                maxLength={40}
                error={errors.make}
              />
              <Input
                label="Modelo"
                value={model}
                onChangeText={(value) => {
                  setModel(value);
                  setErrors((current) => ({ ...current, model: undefined }));
                }}
                placeholder="Civic, Model 3, MT-07…"
                autoCapitalize="words"
                maxLength={60}
                error={errors.model}
              />
              <View style={styles.twoColumns}>
                <Input
                  label="Año"
                  value={year}
                  onChangeText={(value) => {
                    setYear(value.replace(/[^0-9]/g, '').slice(0, 4));
                    setErrors((current) => ({ ...current, year: undefined }));
                  }}
                  placeholder="2024"
                  keyboardType="number-pad"
                  maxLength={4}
                  style={styles.flex}
                  error={errors.year}
                />
                <Input
                  label="Apodo"
                  value={nickname}
                  onChangeText={setNickname}
                  placeholder="El Rojo"
                  maxLength={40}
                  style={styles.flex}
                />
              </View>
              <Input
                label="Odómetro"
                value={odometer}
                onChangeText={(value) => {
                  setOdometer(value.replace(/[^0-9.,]/g, ''));
                  setErrors((current) => ({ ...current, odometer: undefined }));
                }}
                placeholder="48210"
                keyboardType="decimal-pad"
                rightSlot={<AppText variant="caption" color={colors.dim}>km</AppText>}
                error={errors.odometer}
              />
            </View>
          </View>

          {!electric ? (
            <View style={styles.section}>
              <AppText variant="label" color={colors.muted}>Combustible</AppText>
              <View style={styles.fuelRow}>
                {availableFuels.map((option) => {
                  const active = fuel === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setFuel(option.key)}
                      accessibilityRole="radio"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.fuelOption,
                        active && styles.fuelOptionActive,
                      ]}
                    >
                      <Ionicons
                        name={option.icon}
                        size={16}
                        color={active ? colors.lime : colors.muted}
                      />
                      <AppText
                        variant="caption"
                        color={active ? colors.text : colors.muted}
                      >
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <AppText variant="label" color={colors.muted}>
              {electric ? 'Consumo eléctrico' : 'Consumo combinado'}
            </AppText>
            <Input
              value={efficiency}
              onChangeText={(value) => {
                setEfficiency(value.replace(/[^0-9.,]/g, ''));
                setErrors((current) => ({ ...current, efficiency: undefined }));
              }}
              placeholder={electric ? '15.8' : '12.0'}
              keyboardType="decimal-pad"
              rightSlot={
                <AppText variant="caption" color={colors.dim}>
                  {electric ? 'kWh/100 km' : 'km/L'}
                </AppText>
              }
              error={errors.efficiency}
            />
            <AppText variant="caption" color={colors.dim} style={{ marginTop: 6 }}>
              Puedes ajustarlo después con tus repostajes reales.
            </AppText>
          </View>

          <View style={styles.section}>
            <AppText variant="label" color={colors.muted}>Color</AppText>
            <View style={styles.colorRow}>
              {DEFAULT_VEHICLE_COLORS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setColor(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: color === item }}
                  style={[
                    styles.colorDot,
                    { backgroundColor: item },
                    color === item && styles.colorDotActive,
                  ]}
                  accessibilityLabel={`Color ${item}`}
                >
                  {color === item ? (
                    <Ionicons
                      name="checkmark"
                      size={15}
                      color={item === '#F3F6FA' ? colors.bg : '#F3F6FA'}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>

          <Card style={styles.summary}>
            <View style={[styles.summaryIcon, { backgroundColor: `${meta.color}18` }]}>
              <Ionicons name={meta.icon} size={22} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {make.trim() || 'Tu'} {model.trim() || 'vehículo'}
              </AppText>
              <AppText variant="caption" color={colors.muted}>
                {meta.shortLabel} · {year || 'Año'} ·{' '}
                {electric ? 'Eléctrico' : fuel === 'diesel' ? 'Diésel' : 'Gasolina'}
              </AppText>
            </View>
            {firstVehicle ? <Pill label="Principal" tone="accent" icon="star" /> : null}
          </Card>

          {formError ? <AuthNotice message={formError} /> : null}

          <Button
            label={createVehicle.isPending || updateVehicle.isPending
              ? 'Guardando…'
              : editingVehicle
                ? 'Guardar cambios'
                : 'Guardar vehículo'}
            icon="checkmark-circle-outline"
            size="lg"
            loading={createVehicle.isPending || updateVehicle.isPending}
            onPress={submit}
            style={{ marginTop: spacing.sm }}
          />

          <View style={styles.footer}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.dim} />
            <AppText variant="caption" color={colors.dim} style={{ flex: 1 }}>
              La placa y el odómetro son privados. Solo el perfil público que tú
              elijas se comparte por QR.
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'],
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
  section: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  fields: {
    gap: spacing.md,
  },
  kindGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  kindOption: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: 4,
  },
  kindIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoColumns: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  fuelRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fuelOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fuelOptionActive: {
    borderColor: 'rgba(201,255,77,0.35)',
    backgroundColor: colors.limeSoft,
  },
  colorRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  colorDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: colors.text,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing.lg,
    paddingHorizontal: 4,
  },
});
