import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { AppText } from '@/src/components/ui';
import { colors, fonts } from '@/src/theme';

// Intro al abrir la app, en tres actos: zoom dentro de una galaxia espiral;
// al llenar la pantalla se desvanece y aparece el planeta Tierra (el globo del
// mapa), que gira hasta tu lado del mundo; luego la cámara baja hasta tu
// calle. Encima, el saludo personalizado.

export const GALAXY_MS = 2100;
// Cuando la galaxia empieza a desvanecerse, la Tierra gira hacia ti...
export const EARTH_START_MS = 1600;
export const EARTH_MS = 2600;
// ...y después la cámara baja desde el espacio hasta tu posición.
export const FLIGHT_START_MS = EARTH_START_MS + EARTH_MS + 200;
export const FLIGHT_MS = 3800;
const GREETING_HOLD_MS = FLIGHT_START_MS + FLIGHT_MS;

type Star = { x: number; y: number; r: number; color: string; opacity: number };

// Generador determinista: la galaxia es siempre la misma.
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const SIZE = 400;
const ARM_COLORS = ['#FFFFFF', '#FFD9C2', '#FFB38A', '#FF8A5C', colors.accent];

function buildGalaxy(): Star[] {
  const rand = random(42);
  const stars: Star[] = [];
  const center = SIZE / 2;
  // Dos brazos en espiral logarítmica, con dispersión que crece hacia fuera.
  for (let arm = 0; arm < 2; arm += 1) {
    for (let index = 0; index < 220; index += 1) {
      const theta = index * 0.045 + rand() * 0.15;
      const radius = 7 * Math.exp(0.3 * theta);
      if (radius > center * 0.95) break;
      const spread = 3 + radius * 0.16;
      const angle = theta + arm * Math.PI;
      const fade = radius / (center * 0.95);
      stars.push({
        x: center + Math.cos(angle) * radius + (rand() - 0.5) * spread,
        y: center + Math.sin(angle) * radius * 0.62 + (rand() - 0.5) * spread * 0.62,
        r: 0.5 + rand() * (1.6 - fade),
        color: ARM_COLORS[Math.min(ARM_COLORS.length - 1, Math.floor(fade * ARM_COLORS.length + rand()))],
        opacity: 0.45 + rand() * 0.55 * (1 - fade * 0.5),
      });
    }
  }
  // Polvo del disco.
  for (let index = 0; index < 160; index += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = Math.pow(rand(), 1.8) * center * 0.8;
    stars.push({
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius * 0.62,
      r: 0.4 + rand() * 0.6,
      color: '#FFE8DA',
      opacity: 0.25 + rand() * 0.35,
    });
  }
  return stars;
}

function buildSky(width: number, height: number): Star[] {
  const rand = random(7);
  return Array.from({ length: 140 }, () => ({
    x: rand() * width,
    y: rand() * height,
    r: 0.4 + rand() * 1.1,
    color: rand() > 0.85 ? '#BFD4FF' : '#FFFFFF',
    opacity: 0.3 + rand() * 0.6,
  }));
}

const GALAXY = buildGalaxy();

export type IntroGreeting = {
  eyebrow: string;
  title: string;
  subtitle: string;
  chips: string[];
};

export function GalaxyIntro({
  greeting,
  onDone,
}: {
  greeting: IntroGreeting;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const sky = useMemo(() => buildSky(width, height), [width, height]);
  const galaxySize = Math.min(width, height) * 0.9;

  const zoom = useSharedValue(0);
  const space = useSharedValue(1);
  const greet = useSharedValue(0);

  useEffect(() => {
    zoom.value = withTiming(1, { duration: GALAXY_MS, easing: Easing.in(Easing.cubic) });
    space.value = withDelay(EARTH_START_MS, withTiming(0, { duration: GALAXY_MS - EARTH_START_MS + 200 }));
    greet.value = withDelay(500, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    const hide = setTimeout(() => {
      greet.value = withTiming(0, { duration: 600 }, (finished) => {
        if (finished) runOnJS(onDone)();
      });
    }, GREETING_HOLD_MS);
    return () => clearTimeout(hide);
    // Solo al montar: la intro corre una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const galaxyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.35 + zoom.value * zoom.value * 11 }, { rotate: `${zoom.value * 50}deg` }],
  }));
  const skyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + zoom.value * 0.6 }],
  }));
  const spaceStyle = useAnimatedStyle(() => ({ opacity: space.value }));
  const greetStyle = useAnimatedStyle(() => ({
    opacity: greet.value,
    transform: [{ translateY: (1 - greet.value) * 16 }],
  }));

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onDone}
      accessibilityRole="button"
      accessibilityLabel={`${greeting.title}. ${greeting.subtitle}`}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.space, spaceStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, skyStyle]}>
          <Svg width={width} height={height}>
            {sky.map((star, index) => (
              <Circle key={index} cx={star.x} cy={star.y} r={star.r} fill={star.color} opacity={star.opacity} />
            ))}
          </Svg>
        </Animated.View>
        <View style={styles.center}>
          <Animated.View style={[{ width: galaxySize, height: galaxySize }, galaxyStyle]}>
            <Svg width={galaxySize} height={galaxySize} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <Defs>
                <RadialGradient id="halo" cx="50%" cy="50%" rx="50%" ry="31%">
                  <Stop offset="0" stopColor="#FF8A5C" stopOpacity={0.55} />
                  <Stop offset="0.45" stopColor="#7A2E12" stopOpacity={0.22} />
                  <Stop offset="1" stopColor="#000000" stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="core" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
                  <Stop offset="0.35" stopColor="#FFD2B8" stopOpacity={0.85} />
                  <Stop offset="1" stopColor="#FF6A33" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2} fill="url(#halo)" />
              {GALAXY.map((star, index) => (
                <Circle key={index} cx={star.x} cy={star.y} r={star.r} fill={star.color} opacity={star.opacity} />
              ))}
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={26} fill="url(#core)" />
            </Svg>
          </Animated.View>
        </View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.greeting, { top: height * 0.16 }, greetStyle]}>
        <AppText variant="label" color={colors.accent} style={styles.eyebrow}>
          {greeting.eyebrow}
        </AppText>
        <AppText variant="display" color="#FFFFFF" style={styles.title} numberOfLines={2}>
          {greeting.title}
        </AppText>
        <AppText variant="body" color="#E6E6EC" style={styles.subtitle}>
          {greeting.subtitle}
        </AppText>
        {greeting.chips.length > 0 ? (
          <View style={styles.chips}>
            {greeting.chips.map((chip) => (
              <View key={chip} style={styles.chip}>
                <AppText variant="caption" color="#FFFFFF">
                  {chip}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  space: { backgroundColor: '#000000' },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  greeting: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  eyebrow: { letterSpacing: 2.4, marginBottom: 6 },
  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 44,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowRadius: 12,
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(13,13,15,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,106,51,0.45)',
  },
});
