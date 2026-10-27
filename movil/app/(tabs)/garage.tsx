import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Share, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { QRCard } from '@/src/components/QRCard';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  IconButton,
  Pill,
  Screen,
  SectionHeader,
  Stat,
} from '@/src/components/ui';
import { type Vehicle } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useGarageVehicles, pickVehiclePhoto, useSetVehiclePhoto } from '@/src/hooks/useGarage';
import { profileUrl, vehicleUrl } from '@/src/lib/qr';
import {
  isElectric,
  vehicleFuelLabel,
  vehicleKindMeta,
} from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

function CarSilhouette() {
  return (
    <Svg width={210} height={92} viewBox="0 0 210 92" style={styles.carSilhouette}>
      <Path
        d="M18 64 C 30 62, 36 50, 48 44 C 64 36, 82 34, 104 34 C 128 34, 142 38, 156 46 C 166 51, 174 58, 188 60 C 196 61, 200 66, 200 72 L 196 80 L 14 80 C 10 80, 8 76, 9 71 C 10 67, 13 65, 18 64 Z"
        fill="rgba(255,255,255,0.12)"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
      />
      <Path
        d="M58 44 C 72 34, 86 31, 104 31 C 122 31, 136 34, 148 43 L 138 47 C 126 40, 116 38, 104 38 C 90 38, 78 40, 68 47 Z"
        fill="rgba(0,0,0,0.4)"
      />
      <Path d="M10 70 L 200 68" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      <Path d="M40 80 L 40 88 M 172 80 L 172 88" stroke="rgba(255,255,255,0.4)" strokeWidth={2} />
    </Svg>
  );
}

export default function GarageScreen() {
  const router = useRouter();
  const me = useCurrentUser();
  const { vehicles: garageVehicles, isLoading, isError, refetch } = useGarageVehicles();
  const setPhoto = useSetVehiclePhoto();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const vehicle = garageVehicles.find((item) => item.id === selectedId) ?? garageVehicles[0];
  const meta = vehicle ? vehicleKindMeta[vehicle.kind] : null;
  const electric = vehicle ? isElectric(vehicle) : false;

  const changePhoto = async () => {
    if (!vehicle) return;
    try {
      const uri = await pickVehiclePhoto();
      if (!uri) return;
      await setPhoto.mutateAsync({ vehicleId: vehicle.id, uri });
    } catch (error) {
      Alert.alert(
        'Foto del vehículo',
        error instanceof Error ? error.message : 'No pudimos actualizar la foto.',
      );
    }
  };

  const shareQr = async () => {
    await Share.share({
      message: `Mi perfil de Caravana: ${profileUrl(me.username)}`,
      url: profileUrl(me.username),
    });
  };

  const shareVehicle = async (item: Vehicle) => {
    await Share.share({
      message: `${item.make} ${item.model} de @${me.username} en Caravana: ${vehicleUrl(
        item.qrSlug,
      )}`,
      url: vehicleUrl(item.qrSlug),
    });
  };

  const openNewVehicle = () => router.push('/vehicle/new');

  const header = (
    <View style={styles.header}>
      <View>
        <AppText variant="label" color={colors.accent}>GARAJE</AppText>
        <AppText variant="h1" style={{ marginTop: 4 }}>Mis vehículos</AppText>
      </View>
      <IconButton icon="add" tone="accent" color="#120802" onPress={openNewVehicle} />
    </View>
  );

  if (isLoading) {
    return (
      <Screen>
        {header}
        <View style={styles.loadingState}>
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
        {header}
        <EmptyState
          icon="cloud-offline-outline"
          title="No pudimos cargar el garaje"
          description="Revisa tu conexión y vuelve a intentarlo. Tus vehículos siguen guardados."
        />
        <Button label="Reintentar" variant="secondary" onPress={() => refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}

      {vehicle && meta ? (
        <LinearGradient
        colors={
          electric
            ? ['#0A1D21', '#131A20', '#10151B']
            : ['#3A1512', '#1A1517', '#10151B']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.carCard, electric && styles.carCardElectric]}
      >
        <View style={styles.carTop}>
          <Pill
            label={vehicle.isPrimary ? 'Vehículo principal' : meta.label}
            tone={electric ? 'lime' : 'accent'}
            icon={vehicle.isPrimary ? 'star' : meta.icon}
          />
          <Pill label={String(vehicle.year)} tone="neutral" />
        </View>
        <Pressable
          onPress={changePhoto}
          disabled={setPhoto.isPending}
          style={({ pressed }) => [styles.carArt, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={
            vehicle.photoUrl ? 'Cambiar foto del vehículo' : 'Añadir foto del vehículo'
          }
        >
          {vehicle.photoUrl ? (
            <>
              <Image
                source={{ uri: vehicle.photoUrl }}
                style={styles.vehiclePhoto}
                resizeMode="cover"
              />
              <View style={styles.photoBadge}>
                <Ionicons name="camera" size={14} color="#120802" />
                <AppText variant="label" style={styles.photoBadgeText}>
                  {setPhoto.isPending ? 'Subiendo…' : 'Cambiar foto'}
                </AppText>
              </View>
            </>
          ) : setPhoto.isPending ? (
            <ActivityIndicator color={meta.color} />
          ) : (
            <>
              {vehicle.kind === 'car' ? (
                <CarSilhouette />
              ) : (
                <View style={[styles.vehicleArt, { backgroundColor: `${meta.color}12` }]}>
                  <Ionicons name={meta.icon} size={74} color={`${meta.color}CC`} />
                  <View style={[styles.vehicleArtLine, { backgroundColor: `${meta.color}55` }]} />
                </View>
              )}
              <View style={[styles.photoBadge, styles.photoBadgeEmpty]}>
                <Ionicons name="camera-outline" size={14} color={colors.accent} />
                <AppText variant="label" color={colors.accent} style={styles.photoBadgeText}>
                  Añadir foto
                </AppText>
              </View>
            </>
          )}
        </Pressable>
        <View style={styles.carInfo}>
          <AppText variant="label" color={colors.textSoft}>
            {vehicle.make.toUpperCase()} · {vehicleFuelLabel(vehicle).toUpperCase()}
          </AppText>
          <AppText variant="h1" style={{ marginTop: 2 }}>{vehicle.model}</AppText>
          <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
            “{vehicle.nickname}” · {vehicle.odometerKm.toLocaleString('es-DO')} km
          </AppText>
        </View>
        <View style={styles.carStats}>
          <Stat
            value={`${vehicle.efficiency.toFixed(1).replace('.', ',')}`}
            label={electric ? 'kWh/100' : 'km/L'}
          />
          <View style={styles.carDivider} />
          <Stat value={vehicle.odometerKm.toLocaleString('es-DO')} label="km" />
          <View style={styles.carDivider} />
          <Stat value="Activo" label="QR público" accent={meta.color} />
        </View>
        <View style={styles.carActions}>
          <Button label="Editar" variant="secondary" icon="create-outline" size="sm" onPress={() => {}} />
          <Button
            label={electric ? 'Ver cargas' : 'Ver consumo'}
            variant="ghost"
            icon={electric ? 'flash-outline' : 'speedometer-outline'}
            size="sm"
            onPress={() => router.push('/(tabs)/fuel')}
          />
        </View>
      </LinearGradient>
      ) : (
        <Card style={styles.emptyGarage}>
          <View style={styles.emptyIcon}>
            <Ionicons name="car-sport-outline" size={30} color={colors.accent} />
          </View>
          <AppText variant="h2" align="center" style={{ marginTop: spacing.md }}>
            Tu garaje está vacío
          </AppText>
          <AppText variant="caption" color={colors.muted} align="center" style={{ marginTop: 6 }}>
            Añade tu primer coche, moto, EV o camión para empezar a registrar
            rutas, consumo y su QR.
          </AppText>
          <Button
            label="Añadir mi primer vehículo"
            icon="add"
            onPress={openNewVehicle}
            style={{ marginTop: spacing.lg }}
          />
        </Card>
      )}

      <SectionHeader title="Mi identidad Caravana" action="Compartir" onAction={shareQr} />
      <View style={styles.qrRow}>
        <QRCard
          value={profileUrl(me.username)}
          label="PERFIL"
          caption={`@${me.username}`}
          size={132}
        />
        <View style={styles.qrSide}>
          <Card style={styles.qrInfo}>
            <View style={styles.qrIcon}>
              <Ionicons name="qr-code" size={22} color={colors.lime} />
            </View>
            <AppText variant="title" style={{ marginTop: 10 }}>Tu QR, en el vehículo</AppText>
            <AppText variant="caption" color={colors.muted} style={{ marginTop: 4 }}>
              Coche, moto, EV o camión: cada uno tiene su QR para llevar pegado.
            </AppText>
            <Button
              label="Compartir QR"
              variant="lime"
              size="sm"
              icon="share-outline"
              onPress={shareQr}
              style={{ marginTop: spacing.md }}
            />
          </Card>
          <PressableRow
            icon="scan-outline"
            label="Escanear un QR"
            onPress={() => router.push('/scan')}
          />
        </View>
      </View>

      <SectionHeader title="Vehículos" action="Añadir" onAction={openNewVehicle} />
      {garageVehicles.map((item) => {
        const itemMeta = vehicleKindMeta[item.kind];
        const active = item.id === vehicle?.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => setSelectedId(item.id)}
            style={({ pressed }) => [
              styles.vehicleRow,
              active && styles.vehicleRowActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={[styles.vehicleThumb, { backgroundColor: `${itemMeta.color}1A` }]}>
              {item.photoUrl ? (
                <Image
                  source={{ uri: item.photoUrl }}
                  style={styles.vehicleThumbImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name={itemMeta.icon} size={24} color={itemMeta.color} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.vehicleNameRow}>
                <AppText variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {item.make} {item.model}
                </AppText>
                {item.isPrimary ? <Pill label="Principal" tone="accent" /> : null}
              </View>
              <AppText variant="caption" color={colors.muted}>
                {itemMeta.shortLabel} · {item.year} · {item.nickname} · {item.efficiency}
                {item.kind === 'ev' ? ' kWh/100' : ' km/L'}
              </AppText>
              <AppText variant="label" color={colors.dim} style={{ fontSize: 8, marginTop: 4 }}>
                {vehicleUrl(item.qrSlug)}
              </AppText>
            </View>
            <IconButton
              icon="qr-code-outline"
              size={34}
              tone="ghost"
              onPress={() => shareVehicle(item)}
            />
          </Pressable>
        );
      })}

      {garageVehicles.length > 0 ? (
        <Pressable onPress={openNewVehicle} style={({ pressed }) => [{ opacity: pressed ? 0.82 : 1 }]}>
          <Card style={styles.addVehicle}>
            <View style={styles.addIcon}>
              <Ionicons name="add" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">Añadir coche, moto, EV o camión</AppText>
              <AppText variant="caption" color={colors.muted}>
                Cada vehículo tiene su propio historial, consumo y QR.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.dim} />
          </Card>
        </Pressable>
      ) : null}

      <View style={styles.footer}>
        <Ionicons name="lock-closed" size={12} color={colors.dim} />
        <AppText variant="caption" color={colors.dim}>
          La placa y el odómetro son privados por defecto.
        </AppText>
      </View>
    </Screen>
  );
}

function PressableRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.scanRow}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
        {label}
      </AppText>
      <Ionicons name="chevron-forward" size={14} color={colors.dim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  loadingState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing['4xl'],
  },
  emptyGarage: {
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing['3xl'],
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carCard: {
    marginTop: spacing.lg,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.18)',
    padding: spacing.lg,
    overflow: 'hidden',
  },
  carCardElectric: { borderColor: 'rgba(77,225,255,0.22)' },
  carTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  carArt: {
    alignItems: 'center',
    marginTop: spacing.sm,
    minHeight: 92,
    justifyContent: 'center',
  },
  vehiclePhoto: {
    width: '100%',
    height: 150,
    borderRadius: radius.lg,
  },
  photoBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.lime,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  photoBadgeEmpty: {
    position: 'relative',
    right: undefined,
    bottom: undefined,
    alignSelf: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.3)',
  },
  photoBadgeText: { fontSize: 9 },
  carSilhouette: { opacity: 0.9 },
  vehicleArt: {
    width: 190,
    height: 92,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vehicleArtLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 14,
    height: 1,
  },
  carInfo: { marginTop: spacing.sm },
  carStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  carDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: spacing.lg },
  carActions: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  qrRow: { flexDirection: 'row', gap: 10 },
  qrSide: { flex: 1, gap: 10 },
  qrInfo: { flex: 1, padding: spacing.md },
  qrIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: 8,
  },
  vehicleRowActive: {
    borderColor: 'rgba(255,90,31,0.55)',
    backgroundColor: colors.surfaceAlt,
  },
  vehicleThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vehicleThumbImage: { width: 52, height: 52 },
  vehicleNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addVehicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  addIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
});
