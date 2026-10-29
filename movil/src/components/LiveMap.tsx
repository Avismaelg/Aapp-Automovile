import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { Avatar, AppText, Pill } from '@/src/components/ui';
import type { PartyMember } from '@/src/types/models';
import { colors, radius, spacing } from '@/src/theme';

function Pulse({ color }: { color: string }) {
  const [scale] = useState(() => new Animated.Value(0.8));
  const [opacity] = useState(() => new Animated.Value(0.55));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1.9,
          duration: 1600,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulse,
        {
          borderColor: color,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

export function LiveMap({
  members,
  height = 520,
  compact = false,
}: {
  members: PartyMember[];
  height?: number;
  compact?: boolean;
}) {
  return (
    <View style={[styles.container, { height }]}>
      <LinearGradient
        colors={['#0B1118', '#0A0E13', '#080B0F']}
        style={StyleSheet.absoluteFill}
      />
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 390 900"
        preserveAspectRatio="xMidYMin slice"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <SvgGradient id="route" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.lime} />
            <Stop offset="0.55" stopColor={colors.accent} />
            <Stop offset="1" stopColor="#FF9C6B" />
          </SvgGradient>
          <SvgGradient id="water" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#0E1B24" />
            <Stop offset="1" stopColor="#0A131A" />
          </SvgGradient>
        </Defs>

        {/* Agua / parque abstracto */}
        <Path
          d="M-20 380 C 70 330, 120 410, 210 380 S 340 330, 420 370 L 420 920 L -20 920 Z"
          fill="url(#water)"
        />

        {/* Cuadrícula urbana */}
        <G opacity={0.5}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Line
              key={`v${i}`}
              x1={i * 48}
              y1={0}
              x2={i * 48 + 80}
              y2={900}
              stroke="#121A23"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: 18 }).map((_, i) => (
            <Line
              key={`h${i}`}
              x1={0}
              y1={i * 52}
              x2={390}
              y2={i * 52 + 20}
              stroke="#121A23"
              strokeWidth={1}
            />
          ))}
        </G>

        {/* Carreteras principales */}
        <G opacity={0.9}>
          <Path
            d="M-20 120 C 70 150, 120 90, 200 130 S 320 190, 410 160"
            stroke="#1D2834"
            strokeWidth={16}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M-20 120 C 70 150, 120 90, 200 130 S 320 190, 410 160"
            stroke="#263341"
            strokeWidth={2}
            fill="none"
            strokeDasharray="8 10"
          />
          <Path
            d="M70 -20 C 90 90, 40 180, 100 260 S 190 380, 170 540 S 120 700, 190 920"
            stroke="#1B2631"
            strokeWidth={13}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M300 -20 C 280 80, 330 150, 290 240 S 240 380, 300 540 S 350 720, 310 920"
            stroke="#1B2631"
            strokeWidth={11}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M-20 300 C 90 280, 150 330, 240 300 S 340 270, 410 310"
            stroke="#1A2430"
            strokeWidth={9}
            fill="none"
          />
          <Path
            d="M-20 620 C 90 590, 160 650, 250 620 S 340 590, 410 630"
            stroke="#1A2430"
            strokeWidth={9}
            fill="none"
          />
        </G>

        {/* Ruta de la caravana */}
        <Path
          d="M58 430 C 90 380, 120 370, 128 320 S 110 250, 160 222 S 250 210, 262 160 S 250 100, 300 76"
          stroke={colors.accent}
          strokeWidth={14}
          fill="none"
          strokeLinecap="round"
          opacity={0.16}
        />
        <Path
          d="M58 430 C 90 380, 120 370, 128 320 S 110 250, 160 222 S 250 210, 262 160 S 250 100, 300 76"
          stroke="url(#route)"
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="1 0"
        />
        <Circle cx={58} cy={430} r={7} fill={colors.lime} opacity={0.9} />
        <Circle cx={58} cy={430} r={13} fill="none" stroke={colors.lime} strokeWidth={1.5} opacity={0.4} />

        {/* Destino */}
        <G>
          <Circle cx={300} cy={76} r={17} fill={colors.accent} opacity={0.18} />
          <Circle cx={300} cy={76} r={6} fill={colors.accent} />
          <SvgText
            x={300}
            y={48}
            fill={colors.textSoft}
            fontSize={9}
            fontWeight="700"
            textAnchor="middle"
            letterSpacing={0.8}
          >
            DESTINO
          </SvgText>
        </G>

        {/* Etiquetas de zona */}
        <SvgText x={24} y={212} fill="#4A5768" fontSize={9} letterSpacing={1.4}>
          ZONA COLONIAL
        </SvgText>
        <SvgText x={252} y={404} fill="#4A5768" fontSize={9} letterSpacing={1.4}>
          AUTOPISTA
        </SvgText>
      </Svg>

      {/* Cabecera del mapa (la pantalla de party usa su propia barra superior) */}
      {!compact ? (
        <View style={styles.topRow}>
          <Pill label="En vivo" tone="danger" icon="radio" />
          <View style={styles.topRight}>
            <View style={styles.glassButton}>
              <Ionicons name="navigate" size={16} color={colors.text} />
            </View>
            <View style={styles.glassButton}>
              <Ionicons name="layers-outline" size={16} color={colors.text} />
            </View>
          </View>
        </View>
      ) : null}

      {/* Miembros */}
      {members.map((member) => (
        <View
          key={member.id}
          style={[
            styles.marker,
            { left: `${member.x}%`, top: `${member.y}%` },
          ]}
        >
          {member.isTalking ? <Pulse color={member.color} /> : null}
          <Avatar
            name={member.name}
            color={member.color}
            size={member.isHost ? 48 : 38}
            ring={member.isTalking ? colors.white : member.color}
            online
          />
          <View style={styles.markerLabel}>
            <AppText variant="label" style={{ fontSize: 9 }}>
              {member.isHost ? 'HOST' : member.role === 'sweeper' ? 'SWEEPER' : member.name.split(' ')[0].toUpperCase()}
            </AppText>
          </View>
        </View>
      ))}

      {!compact ? (
        <>
          {/* Controles */}
          <View style={styles.controls}>
            <Pressable style={styles.controlButton}>
              <Ionicons name="add" size={19} color={colors.text} />
            </Pressable>
            <View style={styles.controlDivider} />
            <Pressable style={styles.controlButton}>
              <Ionicons name="remove" size={19} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.compass}>
            <Ionicons name="compass" size={18} color={colors.accent} />
          </View>

          <LinearGradient
            colors={['transparent', 'rgba(6,8,11,0.92)']}
            style={styles.bottomFade}
            pointerEvents="none"
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  pulse: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    top: -5,
    left: -5,
  },
  topRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topRight: { flexDirection: 'row', gap: 8 },
  glassButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(13,18,24,0.86)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -19 }, { translateY: -19 }],
  },
  markerLabel: {
    marginTop: 4,
    backgroundColor: 'rgba(7,10,14,0.86)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  controls: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 150,
    backgroundColor: 'rgba(13,18,24,0.9)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  controlButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDivider: { height: 1, backgroundColor: colors.border },
  compass: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 250,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(13,18,24,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 190,
  },
});
