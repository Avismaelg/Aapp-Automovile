import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { useConvoyVoice } from '@/src/store/voice';
import { colors } from '@/src/theme';
import { t } from '@/src/i18n';

// Botón de pulsar para hablar del mapa (CONV-14): mantén pulsado para hablar
// al convoy, suelta para escuchar. Usa la misma sala que la pestaña Party.
export function VoicePTT({ size = 58 }: { size?: number }) {
  const status = useConvoyVoice((state) => state.status);
  const error = useConvoyVoice((state) => state.error);
  const talking = useConvoyVoice((state) => state.talking);
  const handsFree = useConvoyVoice((state) => state.handsFree);
  const micDenied = useConvoyVoice((state) => state.micDenied);
  const othersTalking = useConvoyVoice((state) => state.activeSpeakerIds.length > 0 && !state.talking);
  const setTalking = useConvoyVoice((state) => state.setTalking);
  // `pressed` en estado puede llegar tarde a onPressOut en un toque muy
  // rápido; el ref guarda la pulsación real.
  const pressedRef = useRef(false);
  // Cada pulsación tiene su número: una respuesta vieja no puede apagar el
  // botón de una pulsación nueva.
  const pressSeqRef = useRef(0);

  const start = () => {
    if (status !== 'connected') {
      Alert.alert(
        t('Voz no disponible'),
        error ??
          (status === 'reconnecting' || status === 'offline'
            ? t('Sin conexión con la voz del convoy. Se reconecta sola en cuanto vuelva la red.')
            : t('La voz todavía se está conectando. Espera un momento e inténtalo de nuevo.')),
      );
      return;
    }
    if (micDenied) {
      Alert.alert(t('Micrófono no disponible'), t('Oyes al convoy, pero para hablar activa el micrófono de Caravana en Ajustes.'), [
        { text: t('Ahora no'), style: 'cancel' },
        { text: t('Abrir Ajustes'), onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    const pressId = ++pressSeqRef.current;
    pressedRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    void setTalking(true).then((enabled) => {
      // Si falló (permiso o conexión), suelta el botón aunque el toque siga.
      if (!enabled && pressedRef.current && pressSeqRef.current === pressId) {
        pressedRef.current = false;
      }
    });
  };
  const stop = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    Haptics.selectionAsync().catch(() => {});
    // Con manos libres el micrófono sigue abierto.
    if (!handsFree) void setTalking(false);
  };

  const live = talking || handsFree;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPressIn={start}
        onPressOut={stop}
        delayLongPress={10_000}
        hitSlop={8}
        style={[
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          live && styles.live,
          othersTalking && !live && styles.listening,
          status !== 'connected' && styles.offline,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('Mantén pulsado para hablar al convoy')}
      >
        {status === 'connecting' || status === 'reconnecting' ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Ionicons name={live ? 'mic' : othersTalking ? 'volume-high' : 'mic-outline'} size={size * 0.42} color={live ? '#120802' : colors.text} />
        )}
      </Pressable>
      {live || othersTalking ? (
        <View style={[styles.tag, live ? styles.tagLive : styles.tagListening]}>
          <AppText variant="label" color={live ? '#120802' : colors.text} style={{ fontSize: 9 }}>
            {live ? t('HABLANDO') : t('ESCUCHANDO')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,16,20,0.92)',
    borderWidth: 2,
    borderColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  live: { backgroundColor: colors.accent, borderColor: colors.accent },
  listening: { borderColor: colors.lime },
  offline: { borderColor: colors.border, opacity: 0.85 },
  tag: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagLive: { backgroundColor: colors.accent },
  tagListening: { backgroundColor: 'rgba(14,16,20,0.92)', borderWidth: 1, borderColor: colors.lime },
});
