import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/src/components/ui';
import { useGarageVehicles, useSetVehiclePhoto } from '@/src/hooks/useGarage';
import { useSignupDraft } from '@/src/store/signup-draft';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

// Tareas tras el alta, ya con sesión:
// - REG-06: sube la foto del vehículo elegida en el registro. Si falla, la
//   cuenta y el vehículo ya existen; se reintenta en el siguiente arranque.
// - REG-12: a quien no tiene vehículo (cuentas antiguas) se le recuerda,
//   sin bloquear, que añada uno.
const DISMISS_KEY = 'caravana.no-vehicle-dismissed';

export function SignupFollowUp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { vehicles, isLoading, isDemo } = useGarageVehicles();
  const setPhoto = useSetVehiclePhoto();
  const pendingPhoto = useSignupDraft((state) => state.pendingPhoto);
  const clearPending = useSignupDraft((state) => state.setPendingPhoto);
  const uploading = useRef(false);
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DISMISS_KEY)
      .then((value) => setDismissed(value === '1'))
      .catch(() => setDismissed(false));
  }, []);

  useEffect(() => {
    if (isDemo || !pendingPhoto || uploading.current) return;
    const primary = vehicles.find((vehicle) => vehicle.isPrimary) ?? vehicles[0];
    if (!primary) return;
    if (primary.photoUrl) {
      clearPending(null);
      return;
    }
    uploading.current = true;
    setPhoto
      .mutateAsync({ vehicleId: primary.id, photo: { uri: pendingPhoto.uri, mimeType: pendingPhoto.mime } })
      .then(() => clearPending(null))
      .catch(() => {
        // Se reintenta la próxima vez que se abra la app.
      })
      .finally(() => {
        uploading.current = false;
      });
  }, [clearPending, isDemo, pendingPhoto, setPhoto, vehicles]);

  if (isDemo || isLoading || dismissed !== false || vehicles.length > 0 || pendingPhoto) return null;

  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISS_KEY, '1').catch(() => undefined);
  };

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 86 }]} pointerEvents="box-none">
      <View style={styles.card}>
        <Ionicons name="car-sport-outline" size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{t('Añade tu vehículo')}</AppText>
          <AppText variant="caption" color={colors.muted}>
            {t('Con él apareces en el mapa, en el convoy y en los retos.')}
          </AppText>
        </View>
        <Button
          label={t('Añadir')}
          size="sm"
          full={false}
          onPress={() => {
            dismiss();
            router.push('/vehicle/new');
          }}
        />
        <Pressable onPress={dismiss} hitSlop={10} accessibilityLabel={t('Cerrar')}>
          <Ionicons name="close" size={18} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
