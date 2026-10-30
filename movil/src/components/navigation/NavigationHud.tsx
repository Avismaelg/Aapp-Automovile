import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/ui';
import type { RouteInstruction, RouteInstructionIcon } from '@/src/lib/map-html';
import { formatInstructionDistance, type nextInstruction } from '@/src/lib/route-instructions';
import { radius, spacing } from '@/src/theme';

type UpcomingInstruction = NonNullable<ReturnType<typeof nextInstruction>>;

const instructionIcons: Record<RouteInstructionIcon, keyof typeof Ionicons.glyphMap> = {
  straight: 'arrow-up',
  left: 'arrow-back',
  right: 'arrow-forward',
  'slight-left': 'return-up-back',
  'slight-right': 'return-up-forward',
  'sharp-left': 'arrow-back',
  'sharp-right': 'arrow-forward',
  uturn: 'refresh',
  roundabout: 'sync',
  merge: 'git-merge',
  arrive: 'flag',
  depart: 'navigate',
};

// Paleta de navegación: verde oscuro para la maniobra (se lee de un vistazo
// de día y de noche) y tarjeta blanca abajo.
const MANEUVER = '#0f5132';
const MANEUVER_DARK = '#0a3d26';
const INK = '#0b1422';
const SOFT = '#5b6675';
const FAST = '#16a34a';
const ALERT = '#e11d48';

type Props = {
  upcoming: UpcomingInstruction | null;
  following: RouteInstruction | null;
  offRoute: boolean;
  hasRoute: boolean;
  arrivalLabel: string | null;
  remainingTimeLabel: string;
  remainingDistanceLabel: string;
  destinationLabel: string;
  speedLabel: string;
  limitKmh: number | null;
  // Próxima curva de la línea de conducción que pide bajar la velocidad.
  curve: { distanceM: number; speedKmh: number } | null;
  northUp: boolean;
  // false cuando has movido el mapa a mano: aparece «Centrar».
  mapFollowing: boolean;
  onRecenter: () => void;
  muted: boolean;
  bottomInset: number;
  onToggleNorth: () => void;
  onToggleMute: () => void;
  onChangeRoute: () => void;
  onClose: () => void;
};

// Navegación activa: la maniobra manda arriba (flecha y distancia grandes,
// calle debajo) y abajo solo lo esencial: tiempo, distancia y llegada.
export function NavigationHud({
  upcoming,
  following,
  offRoute,
  hasRoute,
  arrivalLabel,
  remainingTimeLabel,
  remainingDistanceLabel,
  destinationLabel,
  speedLabel,
  limitKmh,
  curve,
  northUp,
  mapFollowing,
  onRecenter,
  muted,
  bottomInset,
  onToggleNorth,
  onToggleMute,
  onChangeRoute,
  onClose,
}: Props) {
  const speedNow = Number(speedLabel);
  const overLimit = limitKmh != null && Number.isFinite(speedNow) && speedNow > limitKmh + 5;
  const curveUrgent = curve != null && Number.isFinite(speedNow) && speedNow > curve.speedKmh + 15;
  const recalculating = offRoute || !hasRoute;

  return (
    <View pointerEvents="box-none" style={styles.navLayer}>
      <View style={styles.maneuverCard}>
        {recalculating ? (
          <View style={styles.maneuverRow}>
            <View style={styles.maneuverIcon}>
              <Ionicons name="sync" size={30} color="#ffffff" />
            </View>
            <AppText variant="h2" color="#ffffff" style={styles.flex}>
              {offRoute ? 'Recalculando…' : 'Calculando ruta…'}
            </AppText>
          </View>
        ) : (
          <View style={styles.maneuverRow}>
            <View style={styles.maneuverIcon}>
              <Ionicons name={upcoming ? instructionIcons[upcoming.icon] : 'arrow-up'} size={40} color="#ffffff" />
            </View>
            <View style={styles.flex}>
              <AppText variant="display" color="#ffffff" style={styles.maneuverDistance}>
                {upcoming ? formatInstructionDistance(upcoming.remainingM) : 'Sigue recto'}
              </AppText>
              <AppText variant="bodyStrong" color="#d1fae5" numberOfLines={2} style={styles.road}>
                {upcoming
                  ? upcoming.icon !== 'arrive' && upcoming.road
                    ? upcoming.road
                    : upcoming.text
                  : 'Continúa por la ruta'}
              </AppText>
            </View>
          </View>
        )}
        {following && !recalculating ? (
          <View style={styles.thenRow}>
            <AppText variant="caption" color="#a7f3d0">
              Luego
            </AppText>
            <Ionicons name={instructionIcons[following.icon]} size={16} color="#ffffff" />
          </View>
        ) : null}
      </View>

      {curve ? (
        <View style={[styles.curveBadge, curveUrgent && styles.curveBadgeUrgent]}>
          <Ionicons name="warning" size={14} color={curveUrgent ? '#ffffff' : '#422006'} />
          <AppText variant="bodyStrong" color={curveUrgent ? '#ffffff' : '#422006'} style={styles.curveText}>
            Curva en {curve.distanceM < 1000 ? `${Math.round(curve.distanceM / 10) * 10} m` : '1 km'} ·{' '}
            {curve.speedKmh} km/h
          </AppText>
        </View>
      ) : null}

      <View style={styles.leftColumn}>
        {limitKmh != null ? (
          <View style={styles.speedLimit}>
            <AppText variant="bodyStrong" style={styles.speedLimitText}>
              {limitKmh}
            </AppText>
          </View>
        ) : null}
        <View style={[styles.speedBubble, overLimit && styles.speedBubbleOver]}>
          <AppText variant="display" color={overLimit ? '#ffffff' : INK} style={styles.speedValue}>
            {speedLabel}
          </AppText>
          <AppText variant="caption" color={overLimit ? '#ffe4e6' : SOFT} style={styles.speedUnit}>
            km/h
          </AppText>
        </View>
      </View>

      <View style={styles.sideButtons}>
        {!mapFollowing ? (
          <Pressable
            style={styles.recenterButton}
            onPress={onRecenter}
            accessibilityRole="button"
            accessibilityLabel="Recentrar en tu posición"
          >
            <Ionicons name="navigate" size={18} color={MANEUVER} />
            <AppText variant="bodyStrong" color={INK} style={styles.recenterText}>
              Centrar
            </AppText>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.roundButton, northUp && styles.roundButtonActive]}
          onPress={onToggleNorth}
          accessibilityRole="button"
          accessibilityLabel="Orientar el mapa al norte"
        >
          <Ionicons name="compass-outline" size={22} color={northUp ? '#ffffff' : INK} />
        </Pressable>
        <Pressable
          style={[styles.roundButton, muted && styles.roundButtonActive]}
          onPress={onToggleMute}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Activar la voz' : 'Silenciar la voz'}
        >
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={muted ? '#ffffff' : INK} />
        </Pressable>
      </View>

      <View style={[styles.bottomCard, { paddingBottom: bottomInset + spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.bottomRow}>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Terminar la navegación"
          >
            <Ionicons name="close" size={22} color={INK} />
          </Pressable>
          <View style={styles.etaBlock}>
            <AppText variant="display" color={FAST} style={styles.etaTime}>
              {remainingTimeLabel}
            </AppText>
            <AppText variant="body" color={SOFT} numberOfLines={1}>
              {remainingDistanceLabel}
              {arrivalLabel ? ` · ${arrivalLabel}` : ''}
            </AppText>
            <AppText variant="caption" color={SOFT} numberOfLines={1} style={styles.destination}>
              {destinationLabel}
            </AppText>
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={onChangeRoute}
            accessibilityRole="button"
            accessibilityLabel="Cambiar destino"
          >
            <Ionicons name="search" size={20} color={INK} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.2,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
};

const styles = StyleSheet.create({
  navLayer: { flex: 1 },
  flex: { flex: 1 },
  maneuverCard: {
    backgroundColor: MANEUVER,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    ...SHADOW,
  },
  maneuverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  maneuverIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: MANEUVER_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maneuverDistance: { fontSize: 38, lineHeight: 42 },
  road: { fontSize: 17, lineHeight: 22 },
  thenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: MANEUVER_DARK,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  curveBadge: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fde047',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    ...SHADOW,
  },
  curveBadgeUrgent: { backgroundColor: ALERT },
  curveText: { fontSize: 13 },
  leftColumn: { position: 'absolute', left: 0, bottom: 168, alignItems: 'center', gap: spacing.sm },
  speedBubble: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW,
  },
  speedBubbleOver: { backgroundColor: ALERT },
  speedValue: { fontSize: 26, lineHeight: 28 },
  speedUnit: { fontSize: 10, marginTop: -2 },
  speedLimit: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: ALERT,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW,
  },
  speedLimitText: { fontSize: 15, color: INK },
  sideButtons: { position: 'absolute', right: 0, bottom: 168, gap: spacing.sm, alignItems: 'flex-end' },
  recenterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    ...SHADOW,
  },
  recenterText: { fontSize: 15 },
  roundButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    ...SHADOW,
  },
  roundButtonActive: { backgroundColor: INK },
  bottomCard: {
    position: 'absolute',
    left: -spacing.lg,
    right: -spacing.lg,
    bottom: -spacing.md,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#e2e8f0',
    marginBottom: spacing.sm,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaBlock: { flex: 1, alignItems: 'center' },
  etaTime: { fontSize: 30, lineHeight: 34 },
  destination: { marginTop: 1 },
});
