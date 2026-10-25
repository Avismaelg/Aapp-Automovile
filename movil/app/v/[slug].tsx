import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QRCard } from '@/src/components/QRCard';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Pill,
  Stat,
} from '@/src/components/ui';
import { currentUser, vehicles } from '@/src/data/mock';
import { profileUrl, vehicleUrl } from '@/src/lib/qr';
import {
  vehicleEfficiency,
  vehicleFuelLabel,
  vehicleKindMeta,
} from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

export default function PublicVehicleScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const vehicle = vehicles.find((item) => item.qrSlug === slug);

  const share = async () => {
    if (!vehicle) return;
    await Share.share({
      message: `${vehicle.make} ${vehicle.model} de @${currentUser.username} en Caravana: ${vehicleUrl(
        vehicle.qrSlug,
      )}`,
      url: vehicleUrl(vehicle.qrSlug),
    });
  };

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
        <Button label="Volver" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  const meta = vehicleKindMeta[vehicle.kind];
  const electric = vehicle.kind === 'ev';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
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
            <Stat value="128" label="rutas" align="center" />
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Stat value={`${(vehicle.odometerKm / 1000).toFixed(1)}k`} label="km" align="center" />
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Card style={styles.ownerCard}>
          <Avatar name={currentUser.name} color={currentUser.color} size={46} ring={colors.border} online />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={colors.muted}>Pertenece a</AppText>
            <AppText variant="bodyStrong">{currentUser.name}</AppText>
            <AppText variant="caption" color={colors.accent} style={{ marginTop: 1 }}>
              @{currentUser.username}
            </AppText>
          </View>
          <Button
            label="Ver perfil"
            variant="secondary"
            size="sm"
            full={false}
            onPress={() => router.push(`/u/${currentUser.username}`)}
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

        <Card style={styles.qrHint}>
          <Ionicons name="qr-code-outline" size={18} color={colors.accent} />
          <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
            Escaneaste el QR de este {meta.shortLabel.toLowerCase()}. Puedes seguir al dueño para
            ver sus rutas públicas y retos.
          </AppText>
        </Card>

        <View style={styles.actions}>
          <Button label="Seguir vehículo" icon="add-circle-outline" onPress={() => {}} />
          <Button label="Compartir QR" icon="share-outline" variant="secondary" onPress={share} />
        </View>

        <View style={styles.footer}>
          <AppText variant="caption" color={colors.dim} align="center">
            Perfil público de Caravana · {profileUrl(currentUser.username)}
          </AppText>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
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
  qrHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: spacing.md,
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
