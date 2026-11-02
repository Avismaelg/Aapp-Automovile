import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Pill,
  SectionHeader,
  Stat,
} from '@/src/components/ui';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFuelLogs } from '@/src/hooks/useFuelLogs';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { useMaintenance } from '@/src/hooks/useMaintenance';
import { formatMoney, formatNumber } from '@/src/lib/format';
import { exportVehicleSaleReport } from '@/src/lib/pdf';
import { vehicleUrl } from '@/src/lib/qr';
import {
  formatHistoryDate,
  formatMonthYear,
  maintenanceIcon,
  maintenanceSummary,
  maintenanceTotal,
  ownershipLabel,
  vehicleUsage,
} from '@/src/lib/vehicle-history';
import {
  vehicleEfficiency,
  vehicleFuelLabel,
  vehicleKindMeta,
} from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';
import { distanceUnit, formatKmValue, getCurrency, kmToDisplay, t } from '@/src/i18n';

function SaleSpec({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.spec}>
      <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" numberOfLines={1} style={{ marginTop: 3 }}>
        {value}
      </AppText>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <Ionicons name="checkmark-circle" size={15} color={colors.lime} />
      <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

export default function VehicleSaleScreen() {
  const router = useRouter();
  const me = useCurrentUser();
  const { vehicles, isLoading } = useGarageVehicles();
  const { logs: fuelHistory } = useFuelLogs(vehicles);
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const vehicle = vehicles.find((item) => item.qrSlug === slug);
  const { records } = useMaintenance(vehicle?.id);
  const [sharing, setSharing] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
        <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing.md }}>
          {t('Preparando la ficha…')}
        </AppText>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <Ionicons name="document-text-outline" size={38} color={colors.dim} />
        <AppText variant="h2" align="center" style={{ marginTop: spacing.md }}>
          {t('No encontramos este vehículo')}
        </AppText>
        <Button label={t('Volver')} variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  const isOwner =
    vehicle.ownerId === me.id ||
    (vehicle.ownerUsername ? vehicle.ownerUsername === me.username : false);

  if (!isOwner) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed-outline" size={30} color={colors.accent} />
        </View>
        <AppText variant="h2" align="center" style={{ marginTop: spacing.lg }}>
          {t('Ficha privada del dueño')}
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: 8 }}>
          {t('Solo el propietario puede generar y compartir el historial completo de venta.')}
        </AppText>
        <Button label={t('Volver al vehículo')} variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  const meta = vehicleKindMeta[vehicle.kind];
  const summary = maintenanceSummary(vehicle, records);
  const usage = vehicleUsage(vehicle, fuelHistory);
  const totalMaintenance = maintenanceTotal(records);
  const ownerName = vehicle.ownerName ?? me.name;
  const ownerUsername = vehicle.ownerUsername ?? me.username;
  const maintenanceTone =
    summary.status === 'due'
      ? colors.danger
      : summary.status === 'soon'
        ? colors.accent
        : colors.lime;

  const sharePdf = async () => {
    setSharing(true);
    try {
      await exportVehicleSaleReport({
        vehicle,
        ownerName,
        ownerUsername,
        maintenance: records,
        fuelLogs: usage.logs,
        currency: getCurrency(),
      });
    } catch {
      Alert.alert(t('No se pudo generar la ficha'), t('Inténtalo de nuevo desde un dispositivo compatible.'));
    } finally {
      setSharing(false);
    }
  };

  const shareSummary = async () => {
    await Share.share({
      message: t('Ficha de venta de {0} {1} {2} en Caravana. {3} repostajes/cargas, {4} mantenimientos y {5} km registrados. Perfil público: {6}', vehicle.make, vehicle.model, vehicle.year, usage.fillups, records.length, formatKmValue(vehicle.odometerKm), vehicleUrl(vehicle.qrSlug)),
      url: vehicleUrl(vehicle.qrSlug),
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <IconButton icon="arrow-back" onPress={() => router.back()} />
          <Pill label={t('Ficha de venta')} tone="lime" icon="document-text" />
          <IconButton icon="share-social-outline" onPress={shareSummary} />
        </View>

        <LinearGradient
          colors={['#0C1A0D', '#141B16', '#0B0F14']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <Pill label={t('Informe de propiedad')} tone="lime" icon="shield-checkmark" />
            <AppText variant="label" color={colors.textSoft} style={{ fontSize: 9 }}>
              {vehicle.year}
            </AppText>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name={meta.icon} size={62} color={`${meta.color}CC`} />
          </View>
          <AppText variant="label" color={meta.color} align="center">
            {vehicle.make.toUpperCase()}
          </AppText>
          <AppText variant="h1" align="center" style={{ marginTop: 2 }}>
            {vehicle.model}
          </AppText>
          <AppText variant="caption" color={colors.muted} align="center" style={{ marginTop: 3 }}>
            “{vehicle.nickname}” · {vehicleFuelLabel(vehicle)}
          </AppText>

          <View style={styles.ownerRow}>
            <Avatar name={ownerName} color={me.color} size={38} uri={me.avatarUrl} ring={colors.surface} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.muted}>{t('Propietario')}</AppText>
              <AppText variant="bodyStrong">{ownerName} · @{ownerUsername}</AppText>
            </View>
            <Pill label={ownershipLabel(vehicle.acquiredAt)} tone="dark" />
          </View>
        </LinearGradient>

        <SectionHeader title={t('Resumen de uso')} />
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <Stat value={`${(kmToDisplay(vehicle.odometerKm) / 1000).toFixed(1)}k`} label={t('{0} actuales', distanceUnit())} />
          </Card>
          <Card style={styles.statCard}>
            <Stat value={String(records.length)} label="mantenimientos" />
          </Card>
          <Card style={styles.statCard}>
            <Stat value={String(usage.fillups)} label={usage.electric ? 'cargas' : 'repostajes'} />
          </Card>
          <Card style={styles.statCard}>
            <Stat value={formatMoney(totalMaintenance)} label={t('invertido en servicio')} />
          </Card>
        </View>

        <SectionHeader title={t('Datos del vehículo')} />
        <Card>
          <View style={styles.specGrid}>
            <SaleSpec label={t('AÑO')} value={String(vehicle.year)} />
            <SaleSpec label="TIPO" value={meta.shortLabel} />
            <SaleSpec label={t('ENERGÍA')} value={vehicleFuelLabel(vehicle)} />
            <SaleSpec label="RENDIMIENTO" value={vehicleEfficiency(vehicle)} />
            <SaleSpec label={t('ODÓMETRO')} value={formatKmValue(vehicle.odometerKm)} />
            <SaleSpec label={t('EN CARAVANA DESDE')} value={formatMonthYear(vehicle.acquiredAt)} />
          </View>
        </Card>

        <SectionHeader title={t('Mantenimiento')} action={records.length ? `${records.length} registros` : undefined} />
        <Card style={[styles.maintenanceCard, { borderColor: `${maintenanceTone}45` }]}>
          <View style={styles.maintenanceTop}>
            <View style={[styles.maintenanceIcon, { backgroundColor: `${maintenanceTone}18` }]}>
              <Ionicons name="shield-checkmark-outline" size={22} color={maintenanceTone} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{summary.label}</AppText>
              <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
                {summary.detail}
              </AppText>
            </View>
            <Pill
              label={summary.status === 'ok' ? t('Al día') : summary.status === 'soon' ? t('Próximo') : t('Pendiente')}
              tone={summary.status === 'ok' ? 'lime' : summary.status === 'soon' ? 'accent' : 'danger'}
            />
          </View>

          {records.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="construct-outline" size={19} color={colors.dim} />
              <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
                {t('No hay mantenimientos registrados todavía para este vehículo.')}
              </AppText>
            </View>
          ) : (
            <View style={styles.recordList}>
              {records.map((record) => (
                <View key={record.id} style={styles.record}>
                  <View style={styles.recordIcon}>
                    <Ionicons name={maintenanceIcon(record.kind)} size={16} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{record.title}</AppText>
                    <AppText variant="caption" color={colors.muted}>
                      {formatHistoryDate(record.date)} · {formatKmValue(record.odometerKm)} · {record.shop}
                    </AppText>
                    {record.notes ? (
                      <AppText variant="caption" color={colors.dim} style={{ marginTop: 2 }}>
                        {record.notes}
                      </AppText>
                    ) : null}
                  </View>
                  <AppText variant="caption" color={colors.textSoft}>
                    {formatMoney(record.cost)}
                  </AppText>
                </View>
              ))}
            </View>
          )}
          <Button
            label={t('Añadir mantenimiento')}
            icon="add-circle-outline"
            variant="secondary"
            size="sm"
            onPress={() =>
              router.push(`/vehicle/maintenance/new?vehicleId=${vehicle.id}`)
            }
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <SectionHeader title={t('Energía y consumo')} action={usage.fillups ? `${usage.fillups} registros` : undefined} />
        <Card>
          {usage.fillups === 0 ? (
            <AppText variant="caption" color={colors.muted}>
              {t('No hay repostajes o cargas registradas para este vehículo.')}
            </AppText>
          ) : (
            <>
              <View style={styles.energySummary}>
                <Stat
                  value={`${formatNumber(usage.totalEnergy, 1)} ${usage.electric ? 'kWh' : 'L'}`}
                  label={usage.electric ? t('energía registrada') : t('combustible registrado')}
                  accent={meta.color}
                />
                <View style={styles.energyDivider} />
                <Stat value={formatMoney(usage.totalSpent)} label={t('gasto registrado')} />
                <View style={styles.energyDivider} />
                <Stat value={formatKmValue(usage.kmTracked)} label={t('tramo medido')} />
              </View>
              <View style={styles.recordList}>
                {usage.logs.slice(0, 5).map((log) => (
                  <View key={log.id} style={styles.record}>
                    <View style={styles.recordIcon}>
                      <Ionicons
                        name={usage.electric ? 'flash-outline' : 'water-outline'}
                        size={16}
                        color={meta.color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" numberOfLines={1}>{log.station}</AppText>
                      <AppText variant="caption" color={colors.muted}>
                        {log.date} · {formatKmValue(log.odometer)}
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <AppText variant="caption" color={colors.textSoft}>{formatMoney(log.total)}</AppText>
                      <AppText variant="caption" color={colors.dim}>
                        {formatNumber(usage.electric ? log.kwh ?? 0 : log.liters, 2)}{' '}
                        {usage.electric ? 'kWh' : 'L'}
                      </AppText>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>

        <SectionHeader title={t('Qué incluye')} />
        <Card style={styles.includes}>
          <Bullet text={t('Datos técnicos y estado del vehículo.')} />
          <Bullet text={t('Historial de mantenimientos con fecha, kilometraje, taller y coste.')} />
          <Bullet text={t('Repostajes o cargas, consumo y gasto registrado.')} />
          <Bullet text={t('Kilómetros y periodo de uso dentro de Caravana.')} />
          <View style={styles.privacyNote}>
            <Ionicons name="eye-off-outline" size={15} color={colors.lime} />
            <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
              {t('No incluye placa, ubicación exacta, teléfono ni datos de pago. La ficha es informativa y no sustituye una inspección mecánica.')}
            </AppText>
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            label={sharing ? t('Generando PDF…') : t('Compartir ficha en PDF')}
            icon="document-text-outline"
            size="lg"
            loading={sharing}
            onPress={sharePdf}
          />
          <Button
            label={t('Compartir resumen')}
            icon="share-social-outline"
            variant="secondary"
            onPress={shareSummary}
          />
        </View>

        <View style={styles.footer}>
          <AppText variant="caption" color={colors.dim} align="center">
            {t('Documento generado por el propietario en Caravana ·')}{' '}{formatHistoryDate(new Date().toISOString())}
          </AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  state: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  lockIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  hero: {
    marginTop: spacing.lg,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.22)',
    padding: spacing.xl,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIcon: { alignItems: 'center', marginTop: spacing.md },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    width: '48%',
    minHeight: 90,
    justifyContent: 'center',
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  spec: {
    width: '48%',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
  },
  maintenanceCard: { padding: spacing.md },
  maintenanceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  maintenanceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  recordList: { marginTop: spacing.md },
  record: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  recordIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  energySummary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  energyDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  includes: { gap: 9 },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  actions: { gap: 9, marginTop: spacing.xl },
  footer: { marginTop: spacing.xl, paddingBottom: spacing.lg },
});
