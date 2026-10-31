import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Share, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import {
  AppText,
  Button,
  EmptyState,
  IconButton,
  Screen,
  ScreenHeader,
  SectionHeader,
  Stat,
} from '@/src/components/ui';
import { showError } from '@/src/lib/alerts';
import type { Vehicle } from '@/src/types/models';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useGarageVehicles, pickVehiclePhoto, useSetVehiclePhoto } from '@/src/hooks/useGarage';
import { profileUrl, vehicleUrl } from '@/src/lib/qr';
import { isElectric, vehicleFuelLabel, vehicleKindMeta } from '@/src/lib/vehicles';
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
      await setPhoto.mutateAsync({ vehicleId: vehicle.id, photo: uri });
    } catch (error) {
      showError('Foto del vehículo', error, 'No pudimos actualizar la foto.');
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
    <ScreenHeader
      title="Garaje"
      right={
        <IconButton
          icon="add"
          tone="accent"
          onPress={openNewVehicle}
          accessibilityLabel="Añadir vehículo"
        />
      }
    />
  );

  if (isLoading) {
    return (
      <Screen>
        {header}
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.textSoft} />
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
        <View style={styles.hero}>
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
              <Image
                source={{ uri: vehicle.photoUrl }}
                style={styles.vehiclePhoto}
                resizeMode="cover"
              />
            ) : setPhoto.isPending ? (
              <ActivityIndicator color={colors.textSoft} />
            ) : vehicle.kind === 'car' ? (
              <CarSilhouette />
            ) : (
              <Ionicons name={meta.icon} size={72} color={colors.textSoft} />
            )}
            <View style={styles.photoBadge}>
              <Ionicons name="camera-outline" size={14} color={colors.text} />
              <AppText variant="caption" color={colors.text}>
                {setPhoto.isPending
                  ? 'Subiendo…'
                  : vehicle.photoUrl
                    ? 'Cambiar foto'
                    : 'Añadir foto'}
              </AppText>
            </View>
          </Pressable>

          <View style={styles.carInfo}>
            <AppText variant="caption" color={colors.muted}>
              {vehicle.make} · {vehicle.year} · {vehicleFuelLabel(vehicle)}
              {vehicle.isPrimary ? ' · Principal' : ''}
            </AppText>
            <AppText variant="h1" style={{ marginTop: 2 }}>
              {vehicle.model}
            </AppText>
            {vehicle.nickname ? (
              <AppText variant="body" color={colors.textSoft} style={{ marginTop: 2 }}>
                “{vehicle.nickname}”
              </AppText>
            ) : null}
          </View>

          <View style={styles.carStats}>
            <Stat
              value={`${vehicle.efficiency.toFixed(1).replace('.', ',')}`}
              label={electric ? 'kWh/100 km' : 'km/L'}
            />
            <Stat value={vehicle.odometerKm.toLocaleString('es-DO')} label="km recorridos" />
            <Stat value={meta.shortLabel} label="tipo" />
          </View>

          <View style={styles.carActions}>
            <Button
              label="Editar"
              variant="secondary"
              size="sm"
              full={false}
              style={{ flex: 1 }}
              onPress={() =>
                router.push({ pathname: '/vehicle/new', params: { vehicleId: vehicle.id } })
              }
            />
            <Button
              label={electric ? 'Cargas' : 'Consumo'}
              variant="secondary"
              size="sm"
              full={false}
              style={{ flex: 1 }}
              onPress={() => router.push('/(tabs)/fuel')}
            />
            <IconButton
              icon="qr-code-outline"
              size={38}
              onPress={() => shareVehicle(vehicle)}
              accessibilityLabel="Compartir QR del vehículo"
            />
          </View>
        </View>
      ) : (
        <View style={styles.emptyGarage}>
          <View style={styles.emptyIcon}>
            <Ionicons name="car-sport-outline" size={30} color={colors.textSoft} />
          </View>
          <AppText variant="h2" align="center" style={{ marginTop: spacing.lg }}>
            Tu garaje está vacío
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: 6 }}>
            Añade tu coche, moto, EV o camión para registrar rutas, consumo y su QR.
          </AppText>
          <Button
            label="Añadir vehículo"
            onPress={openNewVehicle}
            style={{ marginTop: spacing.xl }}
          />
        </View>
      )}

      {garageVehicles.length > 1 ? (
        <>
          <SectionHeader title="Mis vehículos" />
          <View style={styles.group}>
            {garageVehicles.map((item, index) => {
              const itemMeta = vehicleKindMeta[item.kind];
              const active = item.id === vehicle?.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.vehicleRow,
                    index > 0 && styles.rowDivider,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.vehicleThumb}>
                    {item.photoUrl ? (
                      <Image
                        source={{ uri: item.photoUrl }}
                        style={styles.vehicleThumbImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name={itemMeta.icon} size={20} color={colors.textSoft} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {item.make} {item.model}
                    </AppText>
                    <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                      {item.year} · {item.nickname}
                      {item.isPrimary ? ' · Principal' : ''}
                    </AppText>
                  </View>
                  {active ? <Ionicons name="checkmark" size={20} color={colors.text} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <SectionHeader title="QR" />
      <View style={styles.group}>
        <PressableRow icon="share-outline" label="Compartir mi QR" onPress={shareQr} />
        <PressableRow
          icon="scan-outline"
          label="Escanear un QR"
          onPress={() => router.push('/scan')}
          divider
        />
        {garageVehicles.length > 0 ? (
          <PressableRow icon="add" label="Añadir otro vehículo" onPress={openNewVehicle} divider />
        ) : null}
      </View>

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
  divider,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.linkRow,
        divider && styles.rowDivider,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={19} color={colors.textSoft} />
      <AppText variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </AppText>
      <Ionicons name="chevron-forward" size={16} color={colors.dim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing['4xl'],
  },
  emptyGarage: {
    alignItems: 'center',
    marginTop: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    marginTop: spacing.lg,
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  carArt: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  vehiclePhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  photoBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(6,8,11,0.72)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  carSilhouette: { opacity: 0.9 },
  carInfo: { marginTop: spacing.lg },
  carStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  carActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.lg },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  vehicleThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vehicleThumbImage: { width: 44, height: 44 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
});
