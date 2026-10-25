import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import { colors, radius, shadows, spacing } from '@/src/theme';

function Ring({ delay, active }: { delay: number; active: boolean }) {
  const [scale] = useState(() => new Animated.Value(0.9));
  const [opacity] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    if (!active) {
      scale.setValue(0.9);
      opacity.setValue(0.4);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.75,
            duration: 1100,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1100,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.9, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 0.4, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, delay, opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        { borderColor: colors.accent, transform: [{ scale }], opacity },
      ]}
    />
  );
}

function Waveform({ active }: { active: boolean }) {
  const heights = [10, 18, 28, 16, 34, 22, 13, 26, 17];
  return (
    <View style={styles.waveform}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: active ? h : 5,
              backgroundColor: active ? colors.accent : colors.dim,
              opacity: active ? 1 - Math.abs(i - 4) * 0.08 : 0.6,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function PTTButton({
  talking,
  onPressIn,
  onPressOut,
  disabled,
}: {
  talking: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        <Ring delay={0} active={talking} />
        <Ring delay={350} active={talking} />
        <Ring delay={700} active={talking} />
        <Pressable
          disabled={disabled}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          delayLongPress={0}
          style={({ pressed }) => [
            styles.button,
            talking && styles.buttonActive,
            (pressed || talking) && { transform: [{ scale: 0.96 }] },
            disabled && { opacity: 0.4 },
          ]}
        >
          <Ionicons
            name={talking ? 'mic' : 'mic-outline'}
            size={30}
            color={talking ? '#120802' : colors.text}
          />
        </Pressable>
      </View>
      <AppText
        variant="title"
        color={talking ? colors.accent : colors.text}
        style={{ marginTop: spacing.sm }}
      >
        {talking ? 'Hablando…' : 'Mantén para hablar'}
      </AppText>
      <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
        {talking ? 'Tu voz se está compartiendo con la party' : 'Walkie-talkie con tu grupo'}
      </AppText>
      <Waveform active={talking} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  stage: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
  },
  button: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  buttonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...shadows.accent,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    marginTop: spacing.sm,
  },
  bar: {
    width: 4,
    borderRadius: radius.pill,
  },
});
