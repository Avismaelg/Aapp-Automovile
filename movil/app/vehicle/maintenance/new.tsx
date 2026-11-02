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
import {
  AppText,
  Button,
  Card,
  IconButton,
  Input,
  Pill,
} from '@/src/components/ui';
import type { MaintenanceKind, Vehicle } from '@/src/types/models';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { useAddMaintenance } from '@/src/hooks/useMaintenance';
import { useAuth } from '@/src/store/auth';
import { colors, radius, spacing } from '@/src/theme';
import { displayToKm, distanceUnit, formatKmValue, getCurrency, kmToDisplay, t } from '@/src/i18n';

const TODAY = new Date().toISOString().slice(0, 10);

const maintenanceKinds: {
  key: MaintenanceKind;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'oil', label: t('Aceite'), icon: 'water-outline' },
  { key: 'tires', label: t('Neumáticos'), icon: 'ellipse-outline' },
  { key: 'brakes', label: t('Frenos'), icon: 'disc-outline' },
  { key: 'battery', label: t('Batería'), icon: 'battery-charging-outline' },
  { key: 'filters', label: t('Filtros'), icon: 'filter-outline' },
  { key: 'inspection', label: t('Inspección'), icon: 'shield-checkmark-outline' },
  { key: 'other', label: t('Otro'), icon: 'construct-outline' },
];

export default function NewMaintenanceScreen() {
  const router = useRouter();
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const { vehicles, isLoading } = useGarageVehicles();
  const vehicle = vehicles.find((item) => item.id === vehicleId);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/garage');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
        <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing.md }}>
          {t('Cargando vehículo…')}
        </AppText>
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

  return <MaintenanceForm key={vehicle.id} vehicle={vehicle} />;
}

function MaintenanceForm({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter();
  const account = useAuth((state) => state.account);
  const addMaintenance = useAddMaintenance();
  const isDemo = account?.mode === 'demo';

  const [kind, setKind] = useState<MaintenanceKind>('oil');
  const [title, setTitle] = useState('');
  const [serviceDate, setServiceDate] = useState(TODAY);
  const [odometer, setOdometer] = useState(String(Math.round(kmToDisplay(vehicle.odometerKm))));
  const [cost, setCost] = useState('');
  const [shop, setShop] = useState('');
  const [notes, setNotes] = useState('');
  const [nextKm, setNextKm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/garage');
  };

  const save = async () => {
    setError(null);
    if (!title.trim()) {
      setError(t('Escribe qué servicio se realizó.'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      setError(t('Usa una fecha con formato AAAA-MM-DD.'));
      return;
    }
    const odometerNumber = Math.round(displayToKm(Number(odometer.replace(',', '.'))));
    const costNumber = Number(cost.replace(',', '.') || 0);
    const nextKmNumber = nextKm ? Math.round(displayToKm(Number(nextKm.replace(',', '.')))) : undefined;

    if (!Number.isFinite(odometerNumber) || odometerNumber < 0) {
      setError(t('El odómetro debe ser un número positivo.'));
      return;
    }

    try {
      await addMaintenance.mutateAsync({
        vehicleId: vehicle.id,
        kind,
        title,
        serviceDate,
        odometerKm: odometerNumber,
        cost: Number.isFinite(costNumber) ? costNumber : 0,
        shop,
        notes,
        nextKm: nextKmNumber,
      });
      goBack();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('No pudimos guardar el mantenimiento.'),
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
            <AppText variant="label" color={colors.accent}>{t('MANTENIMIENTO')}</AppText>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.heading}>
            <AppText variant="h1">{t('Registra el servicio.')}</AppText>
            <AppText variant="body" color={colors.muted} style={{ marginTop: 6 }}>
              {vehicle.make} {vehicle.model} · {vehicle.year}
            </AppText>
          </View>

          {isDemo ? (
            <AuthNotice
              tone="info"
              message={t('Estás en modo demo: los mantenimientos reales requieren una cuenta conectada.')}
            />
          ) : null}

          <Card style={styles.vehicleCard}>
            <View style={styles.vehicleIcon}>
              <Ionicons name="car-sport" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{vehicle.make} {vehicle.model}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {vehicle.nickname} · {formatKmValue(vehicle.odometerKm)}
              </AppText>
            </View>
            <Pill label={isDemo ? t('Demo') : t('Privado')} tone="neutral" />
          </Card>

          <View style={styles.section}>
            <AppText variant="label" color={colors.muted}>{t('Tipo de servicio')}</AppText>
            <View style={styles.kindGrid}>
              {maintenanceKinds.map((option) => {
                const selected = kind === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setKind(option.key)}
                    style={[styles.kindOption, selected && styles.kindOptionActive]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={17}
                      color={selected ? colors.accent : colors.muted}
                    />
                    <AppText
                      variant="caption"
                      color={selected ? colors.text : colors.muted}
                    >
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Input
              label={t('Servicio')}
              value={title}
              onChangeText={setTitle}
              placeholder={t('Cambio de aceite y filtros')}
              maxLength={100}
            />
            <View style={styles.row}>
              <Input
                label={t('Fecha')}
                value={serviceDate}
                onChangeText={setServiceDate}
                placeholder="AAAA-MM-DD"
                style={styles.flex}
              />
              <Input
                label={t('Odómetro')}
                value={odometer}
                onChangeText={setOdometer}
                placeholder="48210"
                keyboardType="decimal-pad"
                style={styles.flex}
              />
            </View>
            <View style={styles.row}>
              <Input
                label={t('Coste')}
                value={cost}
                onChangeText={setCost}
                placeholder="0"
                keyboardType="decimal-pad"
                rightSlot={<AppText variant="caption" color={colors.dim}>{getCurrency()}</AppText>}
                style={styles.flex}
              />
              <Input
                label={t('Próximo servicio')}
                value={nextKm}
                onChangeText={setNextKm}
                placeholder="52210"
                keyboardType="decimal-pad"
                rightSlot={<AppText variant="caption" color={colors.dim}>{distanceUnit()}</AppText>}
                style={styles.flex}
              />
            </View>
            <Input
              label={t('Taller')}
              value={shop}
              onChangeText={setShop}
              placeholder={t('Nombre del taller')}
              maxLength={120}
            />
            <Input
              label={t('Notas')}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('Repuestos, garantía o detalles')}
              multiline
              maxLength={500}
              inputStyle={styles.notesInput}
            />
          </View>

          {error ? <AuthNotice message={error} /> : null}

          <Button
            label={addMaintenance.isPending ? 'Guardando…' : t('Guardar mantenimiento')}
            icon="checkmark-circle-outline"
            size="lg"
            loading={addMaintenance.isPending}
            disabled={isDemo}
            onPress={save}
            style={{ marginTop: spacing.sm }}
          />
          <View style={styles.footer}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.dim} />
            <AppText variant="caption" color={colors.dim} style={{ flex: 1 }}>
              {t('Los mantenimientos son privados. Solo se incluyen en la ficha de venta cuando tú la compartes.')}
            </AppText>
          </View>
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
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  vehicleIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  kindGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kindOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  kindOptionActive: {
    borderColor: 'rgba(255,90,31,0.45)',
    backgroundColor: colors.accentSoft,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  notesInput: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing.lg,
    paddingHorizontal: 4,
  },
});
