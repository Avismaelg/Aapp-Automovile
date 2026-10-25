import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Input, Pill } from '@/src/components/ui';
import { parseCaravanaUrl } from '@/src/lib/qr';
import { colors, radius, spacing } from '@/src/theme';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [scanned, setScanned] = useState(false);
  const [line] = useState(() => new Animated.Value(0));
  const lock = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web' && permission === null) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(line, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(line, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [line]);

  const open = (raw: string) => {
    if (lock.current) return;
    const link = parseCaravanaUrl(raw);
    if (!link) {
      if (/^[A-Z0-9]{4,8}$/i.test(raw.trim())) {
        router.push(`/party/${raw.trim().toUpperCase()}`);
        return;
      }
      Alert.alert('QR no reconocido', 'Asegúrate de que sea un código de Caravana.');
      return;
    }

    lock.current = true;
    setScanned(true);
    if (link.kind === 'profile') {
      router.push(`/u/${link.id}`);
    } else if (link.kind === 'party') {
      router.push(`/party/${link.id}`);
    } else if (link.kind === 'challenge') {
      router.push(`/challenge/${link.id}`);
    } else {
      router.push(`/v/${link.id}`);
    }
    setTimeout(() => {
      lock.current = false;
      setScanned(false);
    }, 1200);
  };

  const translateY = line.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 220],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.close} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Pill label="Escáner" tone="neutral" icon="scan" />
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.titleBlock}>
        <AppText variant="h1">Escanea un QR</AppText>
        <AppText variant="body" color={colors.muted} style={{ marginTop: 4 }}>
          Perfiles, coches y parties. También puedes escribir el código de una party.
        </AppText>
      </View>

      <View style={styles.scannerWrap}>
        {Platform.OS !== 'web' && permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : ({ data }) => open(data)}
          />
        ) : (
          <LinearGradient colors={['#11171E', '#0A0F14']} style={StyleSheet.absoluteFill}>
            <View style={styles.cameraPlaceholder}>
              <Ionicons name="camera-outline" size={34} color={colors.dim} />
              <AppText variant="caption" color={colors.muted} align="center" style={{ marginTop: 8 }}>
                {Platform.OS === 'web'
                  ? 'La cámara se activa en el móvil. Usa el código de prueba.'
                  : 'Necesitamos permiso para usar la cámara.'}
              </AppText>
              {Platform.OS !== 'web' && permission && !permission.granted ? (
                <Button
                  label="Permitir cámara"
                  variant="secondary"
                  size="sm"
                  onPress={requestPermission}
                  style={{ marginTop: 12, paddingHorizontal: 18 }}
                />
              ) : null}
            </View>
          </LinearGradient>
        )}

        <View style={styles.overlay}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]}>
            <LinearGradient
              colors={['transparent', colors.accent, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>

        <View style={styles.scannerBadge}>
          <View style={styles.liveDot} />
          <AppText variant="label" color={colors.textSoft} style={{ fontSize: 9 }}>
            Apunta al QR del coche o del perfil
          </AppText>
        </View>
      </View>

      <View style={styles.manualBlock}>
        <AppText variant="label" color={colors.muted}>O escribe un código</AppText>
        <View style={styles.manualRow}>
          <Input
            value={manual}
            onChangeText={setManual}
            placeholder="Ej. RUTA26 o @luis_drives"
            autoCapitalize="characters"
            style={{ flex: 1 }}
          />
          <Button
            label="Abrir"
            icon="arrow-forward"
            full={false}
            onPress={() => open(manual)}
            style={{ minWidth: 100 }}
          />
        </View>
        <Pressable
          onPress={() => router.push('/u/luis_drives')}
          style={styles.demoLink}
        >
          <Ionicons name="sparkles-outline" size={14} color={colors.lime} />
          <AppText variant="caption" color={colors.lime}>
            Probar con un perfil de ejemplo
          </AppText>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Ionicons name="shield-checkmark-outline" size={13} color={colors.dim} />
        <AppText variant="caption" color={colors.dim} align="center">
          El QR solo contiene una URL pública. No incluye tu teléfono ni tu ubicación.
        </AppText>
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
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { marginTop: spacing.xl },
  scannerWrap: {
    marginTop: spacing.xl,
    height: 330,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 34,
  },
  corner: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderColor: colors.lime,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 30,
    height: 2,
    opacity: 0.9,
  },
  scannerBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  manualBlock: { marginTop: spacing['2xl'], gap: spacing.sm },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  demoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingVertical: 8,
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    gap: 6,
    paddingBottom: spacing.lg,
  },
});
