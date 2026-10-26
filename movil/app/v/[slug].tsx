import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QRCard } from '@/src/components/QRCard';
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
import { useMaintenance } from '@/src/hooks/useMaintenance';
import { usePublicVehicle } from '@/src/hooks/usePublicVehicle';
import { formatMoney } from '@/src/lib/format';
import { profileUrl, vehicleUrl } from '@/src/lib/qr';
import {
  formatHistoryDate,
  maintenanceIcon,
  maintenanceSummary,
  maintenanceTotal,
  ownershipLabel,
} from '@/src/lib/vehicle-history';
import {
  vehicleEfficiency,
  vehicleFuelLabel,
  vehicleKindMeta,
} from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

function Spec({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.spec}>
      <View style={styles.specIcon}>
        <Ionicons name={icon} size={15} color={colors.accent} />
      </View>
      <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" numberOfLines={1} style={{ marginTop: 2 }}>
        {value}
      </AppText>
    </View>
  );
}

export default function PublicVehicleScreen() {
  const router = useRouter();
  const me = useCurrentUser();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { vehicle, isLoading } = usePublicVehicle(slug);
  const isOwner = Boolean(
    vehicle &&
      (vehicle.ownerId === me.id ||
        (vehicle.ownerUsername ? vehicle.ownerUsername === me.username : false)),
  );
  const { records } = useMaintenance(vehicle?.id, isOwner);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.notFound} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
        <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing.md }}>
          Cargando vehículo…
        </AppText>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.notFound} edges={['top', 'bottom']}>
        <Ionicons name="car-outline" size={38} color={colors.dim} />
        <AppText variant="h2" align="center" style={{ marginTop: spacing.md }}>
          Este vehículo ya no está público
        </AppText>
        <AppText variant="caption" color={colors.muted} align="center" style={{ marginTop: 6 }}>
          El dueño pudo cambiar la privacidad o eliminar el QR.
        </AppText>
        <Button
          label="Volver"
          variant="secondary"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
          style={{ marginTop: spacing.xl }}
        />
      </SafeAreaView>
    );
  }

  const meta = vehicleKindMeta[vehicle.kind];
  const electric = vehicle.kind === 'ev';
  const summary = maintenanceSummary(vehicle, records);
  const ownerName = vehicle.ownerName ?? me.name;
  const ownerUsername = vehicle.ownerUsername ?? me.username;
  const maintenanceTone = !isOwner
    ? colors.dim
    : summary.status === 'due'
      ? colors.danger
      : summary.status === 'soon'
        ? colors.accent
        : colors.lime;
  const totalMaintenance = maintenanceTotal(records);

  const share = async () => {
    await Share.share({
      message: `${vehicle.make} ${vehicle.model} de @${ownerUsername} en Caravana: ${vehicleUrl(
        vehicle.qrSlug,
      )}`,
      url: vehicleUrl(vehicle.qrSlug),
    });
  };

  const openSaleSheet = () => router.push(`/v/${vehicle.qrSlug}/sale`);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <IconButton
            icon="arrow-back"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/');
            }}
          />
          <Pill label="Vehículo verificado por QR" tone="lime" icon="shield-checkmark" />
          <IconButton icon="share-social-outline" onPress={share} />
        </View>

        <LinearGradient
          colors={electric ? ['#0B2025', '#141A20', '#0B0F14'] : ['#2B160F', '#171A20', '#0B0F14']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <Pill label={meta.label} tone={electric ? 'lime' : 'accent'} icon={meta.icon} />
            <AppText variant="label" color={colors.textSoft} style={{ fontSize: 9 }}>
              {vehicle.year}
            </AppText>
          </View>
          <View style={styles.vehicleIcon}>
            <Ionicons name={meta.icon} size={76} color={`${meta.color}CC`} />
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
          <View style={styles.heroStats}>
            <View style={styles.statItem}>
              <Stat value={vehicleEfficiency(vehicle).split(' ')[0]} label={meta.efficiencyLabel} align="center" />
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Stat value={String(records.length)} label="servicios" align="center" />
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Stat value={`${(vehicle.odometerKm / 1000).toFixed(1)}k`} label="km" align="center" />
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <Card style={styles.ownerCard}>
            <Avatar
              name={ownerName}
              color={isOwner ? me.color : meta.color}
              size={46}
              uri={isOwner ? me.avatarUrl : undefined}
              ring={colors.border}
              online
            />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.muted}>Pertenece a</AppText>
              <AppText variant="bodyStrong">{ownerName}</AppText>
              <AppText variant="caption" color={colors.accent} style={{ marginTop: 1 }}>
                @{ownerUsername}
              </AppText>
            </View>
            <Button
              label="Ver perfil"
              variant="secondary"
              size="sm"
              full={false}
              onPress={() => router.push(`/u/${ownerUsername}`)}
              style={{ paddingHorizontal: 14 }}
            />
          </Card>

          <View style={styles.qrRow}>
            <QRCard
              value={vehicleUrl(vehicle.qrSlug)}
              label="VEHÍCULO"
              caption={vehicle.qrSlug}
              size={124}
            />
            <View style={{ flex: 1, gap: 8 }}>
              <Card style={styles.infoCard}>
                <Ionicons name={electric ? 'flash' : 'water-outline'} size={20} color={meta.color} />
                <AppText variant="bodyStrong" style={{ marginTop: 6 }}>
                  {electric ? 'Movilidad eléctrica' : vehicleFuelLabel(vehicle)}
                </AppText>
                <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
                  {electric
                    ? `Consumo medio: ${vehicleEfficiency(vehicle)}. Cero emisiones directas.`
                    : `Rendimiento medio: ${vehicleEfficiency(vehicle)}.`}
                </AppText>
              </Card>
              <View style={styles.privacyRow}>
                <Ionicons name="eye-off-outline" size={15} color={colors.lime} />
                <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
                  La placa y la ubicación no se muestran en este perfil.
                </AppText>
              </View>
            </View>
          </View>

          <SectionHeader
            title="Datos del vehículo"
            action={isOwner ? 'Ficha de venta' : undefined}
            onAction={isOwner ? openSaleSheet : undefined}
          />
          <Card style={styles.specCard}>
            <View style={styles.specGrid}>
              <Spec icon="calendar-outline" label="Año" value={String(vehicle.year)} />
              <Spec icon={meta.icon} label="Tipo" value={meta.shortLabel} />
              <Spec icon="water-outline" label="Energía" value={vehicleFuelLabel(vehicle)} />
              <Spec icon="speedometer-outline" label="Rendimiento" value={vehicleEfficiency(vehicle)} />
              <Spec
                icon="navigate-outline"
                label="Odómetro"
                value={`${vehicle.odometerKm.toLocaleString('es-DO')} km`}
              />
              <Spec icon="time-outline" label="Uso" value={ownershipLabel(vehicle.acquiredAt)} />
            </View>
          </Card>

          <SectionHeader title="Mantenimiento" action={records.length ? `${records.length} registros` : undefined} />
          <Card style={[styles.maintenanceCard, { borderColor: `${maintenanceTone}45` }]}>
            <View style={styles.maintenanceTop}>
              <View style={[styles.maintenanceIcon, { backgroundColor: `${maintenanceTone}18` }]}>
                <Ionicons name="shield-checkmark-outline" size={22} color={maintenanceTone} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">
                  {isOwner ? summary.label : 'Historial privado'}
                </AppText>
                <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
                  {isOwner
                    ? summary.detail
                    : 'El dueño decide si comparte los mantenimientos completos.'}
                </AppText>
              </View>
              <Pill
                label={
                  isOwner
                    ? summary.status === 'ok'
                      ? 'Al día'
                      : summary.status === 'soon'
                        ? 'Próximo'
                        : 'Pendiente'
                    : 'Privado'
                }
                tone={
                  isOwner
                    ? summary.status === 'ok'
                      ? 'lime'
                      : summary.status === 'soon'
                        ? 'accent'
                        : 'danger'
                    : 'neutral'
                }
              />
            </View>

            {isOwner ? (
              <View style={styles.maintenanceMeta}>
              <View style={styles.maintenanceMetaItem}>
                <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>ÚLTIMO SERVICIO</AppText>
                <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
                  {summary.last
                    ? `${summary.last.title} · ${formatHistoryDate(summary.last.date)}`
                    : 'Sin registros todavía'}
                </AppText>
              </View>
              <View style={styles.maintenanceMetaItem}>
                <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>PRÓXIMO</AppText>
                <AppText variant="caption" color={colors.textSoft}>
                  {summary.nextKm.toLocaleString('es-DO')} km
                </AppText>
              </View>
              {isOwner ? (
                <View style={styles.maintenanceMetaItem}>
                  <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>INVERTIDO</AppText>
                  <AppText variant="caption" color={colors.textSoft}>
                    {formatMoney(totalMaintenance, 'DOP')}
                  </AppText>
                </View>
              ) : null}
              </View>
            ) : null}

            {isOwner ? (
              <View style={styles.historyList}>
                {records.length === 0 ? (
                  <AppText variant="caption" color={colors.muted}>
                    Aún no hay mantenimientos registrados para este vehículo.
                  </AppText>
                ) : (
                  records.slice(0, 4).map((record) => (
                    <View key={record.id} style={styles.historyRow}>
                      <View style={styles.historyIcon}>
                        <Ionicons name={maintenanceIcon(record.kind)} size={15} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong" numberOfLines={1}>{record.title}</AppText>
                        <AppText variant="caption" color={colors.muted}>
                          {formatHistoryDate(record.date)} · {record.odometerKm.toLocaleString('es-DO')} km · {record.shop}
                        </AppText>
                      </View>
                      <AppText variant="caption" color={colors.textSoft}>
                        {formatMoney(record.cost, 'DOP')}
                      </AppText>
                    </View>
                  ))
                )}
                <Button
                  label="Añadir mantenimiento"
                  icon="add-circle-outline"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    router.push(`/vehicle/maintenance/new?vehicleId=${vehicle.id}`)
                  }
                  style={{ marginTop: spacing.md }}
                />
              </View>
            ) : (
              <View style={styles.privateHistory}>
                <Ionicons name="lock-closed-outline" size={14} color={colors.muted} />
                <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
                  El historial detallado es privado. El dueño puede compartir la ficha completa
                  contigo si el vehículo está en venta.
                </AppText>
              </View>
            )}
          </Card>

          {isOwner ? (
            <Card style={styles.saleCard}>
              <View style={styles.saleIcon}>
                <Ionicons name="document-text-outline" size={24} color={colors.lime} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="title">¿Vas a venderlo?</AppText>
                <AppText variant="caption" color={colors.muted} style={{ marginTop: 4 }}>
                  Prepara una ficha con datos, mantenimiento, consumo y kilómetros registrados
                  para compartirla con un comprador.
                </AppText>
                <Button
                  label="Preparar ficha de venta"
                  icon="share-outline"
                  variant="lime"
                  size="sm"
                  onPress={openSaleSheet}
                  style={{ marginTop: spacing.md }}
                />
              </View>
            </Card>
          ) : null}

          <View style={styles.actions}>
            <Button label="Compartir QR" icon="share-outline" onPress={share} />
            {isOwner ? (
              <Button label="Ficha de venta" icon="document-text-outline" variant="secondary" onPress={openSaleSheet} />
            ) : (
              <Button
                label="Ver perfil del dueño"
                icon="person-outline"
                variant="secondary"
                onPress={() => router.push(`/u/${ownerUsername}`)}
              />
            )}
          </View>

          <View style={styles.footer}>
            <AppText variant="caption" color={colors.dim} align="center">
              Perfil público de Caravana · {profileUrl(ownerUsername)}
            </AppText>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
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
    borderColor: 'rgba(255,90,31,0.22)',
    padding: spacing.xl,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -130,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,90,31,0.12)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vehicleIcon: { alignItems: 'center', marginTop: spacing.md },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.08)' },
  body: { marginTop: spacing.lg },
  ownerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  qrRow: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  infoCard: { flex: 1, padding: spacing.md },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: 'rgba(201,255,77,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.16)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  specCard: { padding: spacing.md },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spec: {
    width: '48%',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
  },
  specIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
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
  maintenanceMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  maintenanceMetaItem: { flex: 1, gap: 3 },
  historyList: { gap: 2, marginTop: spacing.md },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  historyIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateHistory: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  saleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.lg,
    borderColor: 'rgba(201,255,77,0.22)',
    backgroundColor: 'rgba(201,255,77,0.04)',
  },
  saleIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  footer: { marginTop: spacing.xl, paddingBottom: spacing.lg },
  notFound: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
});
